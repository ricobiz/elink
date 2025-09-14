// ==============================
// EIROS LINK — Cloudflare Worker (Legacy Format)
// Канон PATH, HTML-Wrapper, KV-борда, буфер (set/append/get/set_b64/batch_b64), Morse v3, SSE
// ==============================

// ---------- utils ----------
const json = (o, init={}) => new Response(JSON.stringify(o), {
  headers: {'Content-Type':'application/json','Cache-Control':'no-store', ...(init.headers||{})},
  status: init.status || 200
});

function parseCorsOrigins(str) {
  if (!str) return [];
  return str.split(',').map(s=>s.trim()).filter(Boolean);
}

function corsHeaders(env) {
  const origins = parseCorsOrigins(env.CORS_ALLOW_ORIGIN);
  if (!origins.length) return {};
  // Для Worker: если задан список, выставим первый; браузер всё равно проверит Origin.
  return {
    'Access-Control-Allow-Origin': origins[0] === '*' ? '*' : origins[0],
    'Access-Control-Expose-Headers': 'X-Service, X-Version, X-Reason'
  };
}

const baseHeaders = (env, reason) => ({
  'Content-Type':'text/html; charset=utf-8',
  'Cache-Control':'no-store, max-age=0',
  'X-Service': env.SERVICE_NAME||'eiroslink',
  'X-Version': env.SERVICE_VERSION||'v3.1',
  ...(reason ? {'X-Reason': reason} : {}),
  ...corsHeaders(env)
});

const pre = (env, route, sid='SESSION', extra={}) => {
  const now = new Date().toISOString();
  const lines = [
    `SERVICE: ${env.SERVICE_NAME||'eiroslink'}`,
    `ROUTE: ${route}`,
    `SID: ${sid}`,
    `STATUS: ${extra.status||'ok'}`,
    `VERSION: ${env.SERVICE_VERSION||'v3.1'}`,
    `TS: ${now}`
  ];
  if (extra.text)   lines.push(`TEXT: ${extra.text}`);
  if (extra.X!=null)lines.push(`X: ${extra.X}`);
  if (extra.Y!=null)lines.push(`Y: ${extra.Y}`);
  if (extra.ACTION) lines.push(`ACTION: ${extra.ACTION}`);
  if (extra.DETAIL) lines.push(`DETAIL: ${extra.DETAIL}`);
  return new Response(`<pre>\n${lines.join('\n')}\n</pre>`, { headers: baseHeaders(env, extra.reason) });
};

const ok = (env, route, sid, extra={}) => pre(env, route, sid, extra);

const rnd = ()=>Math.random().toString(36).slice(2,8);
const keyEvent = (sid, ts, id=rnd()) => `event:${sid}:${ts}:${id}`;
const keyStage = (sid) => `stage:${sid}`;
const keyBuf   = (sid) => `buf:${sid}`;

const wantsJSON = (req)=> req.headers.get('accept')?.includes('application/json') || new URL(req.url).searchParams.get('format')==='json';

const normalizeUrl = (raw) => {
  try {
    const s = raw.startsWith('http') ? raw : `https://${raw}`;
    return new URL(s).toString();
  } catch { return `https://${encodeURIComponent(raw)}`; }
};

// ---------- auth / rate-limit ----------
const checkAuth = (env, req) => {
  if (!env.AUTH_TOKEN) return true;
  const h = req.headers.get('authorization')||'';
  const q = new URL(req.url).searchParams.get('token')||'';
  const token = h.startsWith('Bearer ')? h.slice(7) : q;
  return token===env.AUTH_TOKEN;
};

async function rateLimit(env, req) {
  const limit = parseInt(env.RL_BUCKET_PER_MIN||'0',10);
  if (!limit || !env.BOARD) return true;
  const ip = req.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const bucket = `rl:${ip}:${new Date().toISOString().slice(0,16)}`;
  let count = parseInt(await env.BOARD.get(bucket)||'0',10);
  if (count >= limit) return false;
  count += 1;
  await env.BOARD.put(bucket, String(count), { expirationTtl: 90 });
  return true;
}

// ---------- KV helpers ----------
async function writeEvent(env, sid, route, payload={}, status='ok', reason='', req) {
  const ts = new Date().toISOString();
  const id = rnd();
  const ip = req.headers.get('CF-Connecting-IP')||'';
  const ua = req.headers.get('user-agent')||'';
  const ev = { ts, sid, route, payload, status, ip, ua, reason };
  if (env.BOARD) {
    await env.BOARD.put(keyEvent(sid, ts, id), JSON.stringify(ev));
  }
  return ev;
}

async function getStage(env, sid) {
  if (!env.BOARD) return { X:null, Y:null };
  const v = await env.BOARD.get(keyStage(sid)); 
  return v ? JSON.parse(v) : { X:null, Y:null };
}

async function setStage(env, sid, patch) {
  const st = await getStage(env, sid);
  const next = { ...st, ...patch };
  if (env.BOARD) {
    await env.BOARD.put(keyStage(sid), JSON.stringify(next));
  }
  return next;
}

async function bufSet(env, sid, text) {
  if (env.BOARD) {
    await env.BOARD.put(keyBuf(sid), text || "");
  }
  return text || "";
}

async function bufGet(env, sid) {
  if (!env.BOARD) return "";
  return (await env.BOARD.get(keyBuf(sid))) || "";
}

// ---------- main fetch handler ----------
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const env = {
    SERVICE_NAME: 'eiroslink',
    SERVICE_VERSION: 'v3.1',
    PROXY_ORIGIN: 'https://react-node-cloudflare-gq2tdbfmg2.replit.app',
    RL_BUCKET_PER_MIN: '120',
    CORS_ALLOW_ORIGIN: 'https://eiroslink.com, https://eiros.link, https://react-node-cloudflare-gq2tdbfmg2.replit.app'
  };

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': parseCorsOrigins(env.CORS_ALLOW_ORIGIN)[0] || '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Reason'
    }});
  }

  if (!checkAuth(env, request)) {
    return new Response('Unauthorized', { status: 401, headers: baseHeaders(env) });
  }

  const url = new URL(request.url);
  const reason = request.headers.get('X-Reason') || '';
  const fmtJSON = wantsJSON(request);

  // Health
  if (url.pathname === '/h/health' || url.pathname === '/health') {
    const data = {service:env.SERVICE_NAME||'eiroslink', route:'/h/health', status:'ok', version:env.SERVICE_VERSION||'v3.1', ts:new Date().toISOString()};
    return fmtJSON ? json(data) : ok(env, '/h/health', 'SESSION', { status:'ok', reason });
  }

  let m;

  // ===== X/G (clear/flush) =====
  if ((m = url.pathname.match(/^\/h\/x\/([^/]+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const sid = decodeURIComponent(m[1]);
    await setStage(env, sid, { X:null, Y:null });
    await bufSet(env, sid, "");
    const ev = await writeEvent(env, sid, '/h/x', {}, 'ok', reason, request);
    return fmtJSON ? json(ev) : ok(env, '/h/x', sid, { DETAIL:'buffer+stage cleared', reason });
  }
  if ((m = url.pathname.match(/^\/h\/g\/([^/]+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const sid = decodeURIComponent(m[1]);
    const text = await bufGet(env, sid);
    const ev = await writeEvent(env, sid, '/h/g', { text, len: text.length }, 'ok', reason, request);
    await bufSet(env, sid, "");
    return fmtJSON ? json(ev) : ok(env, '/h/g', sid, { DETAIL:`flushed len=${text.length}`, reason });
  }

  // ===== NAVIGATION /h/w (navigate URL) =====
  if ((m = url.pathname.match(/^\/h\/w\/([^/]+)\/(.+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const sid = decodeURIComponent(m[1]);
    const raw = decodeURIComponent(m[2]);
    const urlNorm = normalizeUrl(raw);
    const ev = await writeEvent(env, sid, '/h/w', { url: urlNorm }, 'ok', reason, request);
    return fmtJSON ? json(ev) : ok(env, '/h/w', sid, { text:urlNorm, reason });
  }

  // ===== Screenshot /h/1 =====
  if ((m = url.pathname.match(/^\/h\/1\/([^/]+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const sid = decodeURIComponent(m[1]);
    const ev = await writeEvent(env, sid, '/h/1', {}, 'ok', reason, request);
    return fmtJSON ? json(ev) : ok(env, '/h/1', sid, { DETAIL:'screenshot placeholder', reason });
  }

  // ===== Morse v3: A/B staged; C staged/one-shot =====
  if ((m = url.pathname.match(/^\/A\/(\d+)\/([^/]+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const X = parseInt(m[1],10); const sid = decodeURIComponent(m[2]);
    await setStage(env, sid, { X });
    const ev = await writeEvent(env, sid, '/A', { X }, 'ok', reason, request);
    return fmtJSON ? json(ev) : ok(env, '/A', sid, { X, reason });
  }
  if ((m = url.pathname.match(/^\/B\/(\d+)\/([^/]+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const Y = parseInt(m[1],10); const sid = decodeURIComponent(m[2]);
    await setStage(env, sid, { Y });
    const ev = await writeEvent(env, sid, '/B', { Y }, 'ok', reason, request);
    return fmtJSON ? json(ev) : ok(env, '/B', sid, { Y, reason });
  }
  if ((m = url.pathname.match(/^\/C\/([^/]+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const sid = decodeURIComponent(m[1]);
    const st = await getStage(env, sid);
    if (st.X==null || st.Y==null) {
      const ev = await writeEvent(env, sid, '/C', { error:'no staged coords' }, 'error', reason, request);
      return fmtJSON ? json(ev) : ok(env, '/C', sid, { status:'error', DETAIL:'no staged X/Y', reason });
    }
    const ev = await writeEvent(env, sid, '/C', { X:st.X, Y:st.Y, action:'click', mode:'staged' }, 'ok', reason, request);
    await setStage(env, sid, { X:null, Y:null });
    return fmtJSON ? json(ev) : ok(env, '/C', sid, { X:ev.payload.X, Y:ev.payload.Y, ACTION:'click', reason });
  }
  if ((m = url.pathname.match(/^\/C\/(\d+)\/(\d+)\/([^/]+)$/))) {
    if (!(await rateLimit(env, request))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
    const X = parseInt(m[1],10), Y = parseInt(m[2],10), sid = decodeURIComponent(m[3]);
    const ev = await writeEvent(env, sid, '/C', { X, Y, action:'click', mode:'one-shot' }, 'ok', reason, request);
    return fmtJSON ? json(ev) : ok(env, '/C', sid, { X, Y, ACTION:'click', reason });
  }

  // ===== Proxy to origin for unknown routes =====
  if (env.PROXY_ORIGIN) {
    const target = `${env.PROXY_ORIGIN}${url.pathname}${url.search}`;
    return fetch(target, { headers: request.headers, method: request.method });
  }

  return new Response('<pre>EIROS LINK v3.1 - Not Found</pre>', { status: 404, headers: baseHeaders(env) });
}