// ==============================
// EIROS LINK — Cloudflare Worker
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
const htmlList = (env, route, sid, header, rows) => {
  const top = pre(env, route, sid).body;
  return new Response(`${top}\n<pre>----\n${header}\n${rows||'NO ENTRIES'}</pre>`, { headers: baseHeaders(env) });
};

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
  const bucket = `rl:${ip}:${new Date().toISOString().slice(0,16)}`; // per minute
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
async function listEvents(env, sid, limit=50) {
  if (!env.BOARD) return [];
  const l = await env.BOARD.list({ prefix: `event:${sid}:`, limit: Math.min(limit, 200) });
  const keys = l.keys.sort((a,b)=> a.name < b.name ? 1 : -1).slice(0, Math.min(limit, 200));
  const vals = await Promise.all(keys.map(k=>env.BOARD.get(k.name)));
  return vals.map(v=> JSON.parse(v));
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
async function bufAppend(env, sid, chunk) {
  if (!env.BOARD) return chunk || "";
  const cur = (await env.BOARD.get(keyBuf(sid))) || "";
  const next = cur + (chunk || "");
  await env.BOARD.put(keyBuf(sid), next);
  return next;
}
async function bufGet(env, sid) {
  if (!env.BOARD) return "";
  return (await env.BOARD.get(keyBuf(sid))) || "";
}

// ---------- worker entry ----------
export default {
  async fetch(req, env) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': parseCorsOrigins(env.CORS_ALLOW_ORIGIN)[0] || '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Reason'
      }});
    }

    if (!checkAuth(env, req)) {
      return new Response('Unauthorized', { status: 401, headers: baseHeaders(env) });
    }

    const url = new URL(req.url);
    const reason = req.headers.get('X-Reason') || '';
    const fmtJSON = wantsJSON(req);

    // Legacy redirects → canonical PATH
    if (url.pathname.startsWith('/h/1') && url.searchParams.get('sid')) {
      return Response.redirect(`${url.origin}/h/1/${encodeURIComponent(url.searchParams.get('sid'))}`, 301);
    }
    if (url.pathname.startsWith('/board_html') && url.searchParams.get('sid')) {
      return Response.redirect(`${url.origin}/board_html/${encodeURIComponent(url.searchParams.get('sid'))}`, 301);
    }

    // ===== AI ACCESS ENDPOINTS FOR EXTERNAL AI =====
    if (url.pathname === '/ai-access') {
      const timestamp = new Date().toISOString();
      const currentTime = new Date().toLocaleString('ru-RU', { 
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Получаем реальный URL сервера из PROXY_ORIGIN
      const serverUrl = env.PROXY_ORIGIN || 'https://4fda13ba-4aca-42d7-a8c5-726a6f3c9fbc-00-2qj9mwsgtm3as.worf.replit.dev';

      const htmlResponse = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EIROS LINK - AI Access Point</title>
    <style>
        body { 
            font-family: 'JetBrains Mono', monospace; 
            background: #0f172a; 
            color: #e2e8f0; 
            margin: 0; 
            padding: 40px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .container { 
            text-align: center; 
            max-width: 600px;
            border: 1px solid #334155;
            border-radius: 8px;
            padding: 40px;
            background: #1e293b;
        }
        h1 { color: #3b82f6; margin-bottom: 30px; }
        .status { color: #10b981; font-weight: bold; margin: 20px 0; }
        .time { color: #f59e0b; font-size: 18px; margin: 20px 0; }
        .json { 
            background: #111827; 
            border: 1px solid #374151; 
            border-radius: 6px; 
            padding: 20px; 
            text-align: left; 
            margin: 20px 0;
            overflow-x: auto;
        }
        .endpoint { color: #8b5cf6; margin: 10px 0; }
        a { color: #3b82f6; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .worker-badge { color: #ef4444; font-size: 14px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 EIROS LINK</h1>
        <div class="worker-badge">⚡ Powered by Cloudflare Workers</div>
        <div class="status">✅ СИСТЕМА ДОСТУПНА</div>
        <div class="time">📅 ${currentTime}</div>
        
        <h3>🔗 Link Language API</h3>
        <div class="endpoint">/goto/https://example.com</div>
        <div class="endpoint">/click/button</div>
        <div class="endpoint">/type/input/текст</div>
        <div class="endpoint">/screenshot</div>
        <div class="endpoint">/A/100/session - Stage X coordinate</div>
        <div class="endpoint">/B/200/session - Stage Y coordinate</div>
        <div class="endpoint">/C/session - Execute staged click</div>
        
        <h3>📡 JSON Response</h3>
        <div class="json">
{
  "status": "operational",
  "service": "EIROS_LINK",
  "timestamp": "${timestamp}",
  "moscow_time": "${currentTime}",
  "ai_access": true,
  "source": "cloudflare_worker",
  "domains": [
    "eiros.link",
    "eiroslink.com", 
    "eiroslink.workers.dev",
    "replit.app"
  ],
  "endpoints": {
    "link_language": "/goto/|/click/|/type/|/screenshot",
    "coordinate_system": "/A/|/B/|/C/",
    "buffer_api": "/h/buf/set/|/h/buf/append/|/h/buf/get/",
    "morse_api": "/A/|/B/|/C/",
    "health": "/h/health",
    "events": "/board_json/",
    "proxy_server": "${serverUrl}"
  }
}
        </div>
        
        <p><a href="/ai-status">📊 JSON Status</a> | <a href="/h/health">🔍 Health Check</a></p>
    </div>
</body>
</html>`;

      return new Response(htmlResponse, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Service': 'EIROS_LINK_WORKER',
          'X-Timestamp': timestamp,
          ...corsHeaders(env)
        }
      });
    }

    if (url.pathname === '/ai-status') {
      const timestamp = new Date().toISOString();
      const currentTime = new Date().toLocaleString('ru-RU', { 
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const jsonResponse = {
        status: "operational",
        service: "EIROS_LINK",
        timestamp: timestamp,
        moscow_time: currentTime,
        ai_access: true,
        version: env.SERVICE_VERSION || "v3.1",
        source: "cloudflare_worker",
        proxy_origin: env.PROXY_ORIGIN,
        domains: [
          "eiros.link",
          "eiroslink.com", 
          "eiroslink.workers.dev",
          "react-node-cloudflare-gq2tdbfmg2.replit.app"
        ],
        endpoints: {
          link_language: "/goto/|/click/|/type/|/screenshot",
          coordinate_system: "/A/x/sid|/B/y/sid|/C/sid",
          buffer_api: "/h/buf/set/|/h/buf/append/|/h/buf/get/",
          morse_api: "/A/|/B/|/C/",
          health: "/h/health",
          events: "/board_json/session",
          ai_access: "/ai-access",
          ai_status: "/ai-status"
        },
        capabilities: [
          "browser_automation",
          "coordinate_staging", 
          "buffer_management",
          "event_logging",
          "real_time_events",
          "worker_proxy"
        ]
      };

      return json(jsonResponse, { headers: corsHeaders(env) });
    }

    // Health
    if (url.pathname === '/h/health' || url.pathname === '/health') {
      const data = {service:env.SERVICE_NAME||'eiroslink', route:'/h/health', status:'ok', version:env.SERVICE_VERSION||'v3.1', ts:new Date().toISOString()};
      return fmtJSON ? json(data) : ok(env, '/h/health', 'SESSION', { status:'ok', reason });
    }

    let m;

    // ===== Buffer API (anti-spam) =====
    if ((m = url.pathname.match(/^\/h\/buf\/set\/([^/]+)\/(.+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const text = decodeURIComponent(m[2]);
      await bufSet(env, sid, text);
      const ev = await writeEvent(env, sid, '/h/buf/set', { len: text.length }, 'ok', reason, req);
      return fmtJSON ? json({ ...ev, buffer_preview: text.slice(0,200) }) : ok(env, '/h/buf/set', sid, { DETAIL:`len=${text.length}`, reason });
    }
    if ((m = url.pathname.match(/^\/h\/buf\/append\/([^/]+)\/(.+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const chunk = decodeURIComponent(m[2]);
      const next = await bufAppend(env, sid, chunk);
      const ev = await writeEvent(env, sid, '/h/buf/append', { added: chunk.length, total: next.length }, 'ok', reason, req);
      return fmtJSON ? json({ ...ev, buffer_preview: next.slice(-200) }) : ok(env, '/h/buf/append', sid, { DETAIL:`total=${next.length}`, reason });
    }
    if ((m = url.pathname.match(/^\/h\/buf\/get\/([^/]+)$/))) {
      const sid = decodeURIComponent(m[1]);
      const cur = await bufGet(env, sid);
      return fmtJSON ? json({ sid, buffer: cur, len: cur.length }) : ok(env, '/h/buf/get', sid, { DETAIL:`len=${cur.length}`, text: cur.slice(0,200) });
    }
    if ((m = url.pathname.match(/^\/h\/buf\/set_b64\/([^/]+)\/([A-Za-z0-9\-_]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const b64 = m[2].replace(/-/g,'+').replace(/_/g,'/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const text = new TextDecoder().decode(Uint8Array.from(atob(b64+pad), c=>c.charCodeAt(0)));
      await bufSet(env, sid, text);
      const ev = await writeEvent(env, sid, '/h/buf/set_b64', { len: text.length }, 'ok', reason, req);
      return fmtJSON ? json({ ...ev, buffer_preview: text.slice(0,200) }) : ok(env, '/h/buf/set_b64', sid, { DETAIL:`len=${text.length}`, reason });
    }
    // batch = set_b64 + flush (одним запросом)
    if ((m = url.pathname.match(/^\/h\/batch_b64\/([^/]+)\/([A-Za-z0-9\-_]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const b64 = m[2].replace(/-/g,'+').replace(/_/g,'/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const text = new TextDecoder().decode(Uint8Array.from(atob(b64+pad), c=>c.charCodeAt(0)));
      await bufSet(env, sid, text);
      const ev  = await writeEvent(env, sid, '/h/g', { text, len: text.length, batch:true }, 'ok', reason, req);
      await bufSet(env, sid, "");
      return fmtJSON ? json(ev) : ok(env, '/h/g', sid, { DETAIL:`batch flushed len=${text.length}`, reason });
    }

    // ===== NOTE / ENCODE =====
    if ((m = url.pathname.match(/^\/h\/note\/([^/]+)\/(.+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const text = decodeURIComponent(m[2]);
      const ev  = await writeEvent(env, sid, '/h/note', { text }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/note', sid, { text, reason });
    }
    if ((m = url.pathname.match(/^\/h\/encode\/([^/]+)\/(.+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const cmd = decodeURIComponent(m[2]);
      const ev  = await writeEvent(env, sid, '/h/encode', { command: cmd }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/encode', sid, { text: cmd, reason });
    }

    // ===== X/G (clear/flush) =====
    if ((m = url.pathname.match(/^\/h\/x\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      await setStage(env, sid, { X:null, Y:null });
      await bufSet(env, sid, "");
      const ev  = await writeEvent(env, sid, '/h/x', {}, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/x', sid, { DETAIL:'buffer+stage cleared', reason });
    }
    if ((m = url.pathname.match(/^\/h\/g\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const text = await bufGet(env, sid);
      const ev  = await writeEvent(env, sid, '/h/g', { text, len: text.length }, 'ok', reason, req);
      await bufSet(env, sid, "");
      return fmtJSON ? json(ev) : ok(env, '/h/g', sid, { DETAIL:`flushed len=${text.length}`, reason });
    }

    // ===== NAVIGATION /h/w (navigate URL) =====
    if ((m = url.pathname.match(/^\/h\/w\/([^/]+)\/(.+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const raw = decodeURIComponent(m[2]);
      const urlNorm = normalizeUrl(raw);
      const ev  = await writeEvent(env, sid, '/h/w', { url: urlNorm }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/w', sid, { text:urlNorm, reason });
    }

    // ===== Screenshot /h/1 (placeholder) =====
    if ((m = url.pathname.match(/^\/h\/1\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const ev  = await writeEvent(env, sid, '/h/1', {}, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/1', sid, { DETAIL:'screenshot placeholder', reason });
    }

    // ===== Basic /h/2 scroll /h/3 click (placeholder) =====
    if ((m = url.pathname.match(/^\/h\/2\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const ev  = await writeEvent(env, sid, '/h/2', {}, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/2', sid, { DETAIL:'scroll placeholder', reason });
    }
    if ((m = url.pathname.match(/^\/h\/3\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const ev  = await writeEvent(env, sid, '/h/3', {}, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/3', sid, { DETAIL:'click placeholder', reason });
    }

    // ===== Alt alphabet route /h/w/:char/:sid (не путать с /h/w/:sid/:url) =====
    if ((m = url.pathname.match(/^\/h\/w\/([^/])\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const char = decodeURIComponent(m[1]);
      const sid  = decodeURIComponent(m[2]);
      const ev   = await writeEvent(env, sid, '/h/w_char', { char }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/h/w', sid, { text: char, reason });
    }

    // ===== Morse v3: A/B staged; C staged/one-shot/extended =====
    if ((m = url.pathname.match(/^\/A\/(\d+)\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const X = parseInt(m[1],10); const sid = decodeURIComponent(m[2]);
      await setStage(env, sid, { X });
      const ev = await writeEvent(env, sid, '/A', { X }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/A', sid, { X, reason });
    }
    if ((m = url.pathname.match(/^\/B\/(\d+)\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const Y = parseInt(m[1],10); const sid = decodeURIComponent(m[2]);
      await setStage(env, sid, { Y });
      const ev = await writeEvent(env, sid, '/B', { Y }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/B', sid, { Y, reason });
    }
    if ((m = url.pathname.match(/^\/C\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const sid = decodeURIComponent(m[1]);
      const st  = await getStage(env, sid);
      if (st.X==null || st.Y==null) {
        const ev = await writeEvent(env, sid, '/C', { error:'no staged coords' }, 'error', reason, req);
        return fmtJSON ? json(ev) : ok(env, '/C', sid, { status:'error', DETAIL:'no staged X/Y', reason });
      }
      const ev = await writeEvent(env, sid, '/C', { X:st.X, Y:st.Y, action:'click', mode:'staged' }, 'ok', reason, req);
      await setStage(env, sid, { X:null, Y:null });
      return fmtJSON ? json(ev) : ok(env, '/C', sid, { X:ev.payload.X, Y:ev.payload.Y, ACTION:'click', reason });
    }
    if ((m = url.pathname.match(/^\/C\/(\d+)\/(\d+)\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const X = parseInt(m[1],10), Y = parseInt(m[2],10), sid = decodeURIComponent(m[3]);
      const ev = await writeEvent(env, sid, '/C', { X, Y, action:'click', mode:'one-shot' }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, '/C', sid, { X, Y, ACTION:'click', reason });
    }
    if ((m = url.pathname.match(/^\/C\/(double|right|move|drag_start|drag_end|scroll)\/(\d+)\/(\d+)\/([^/]+)$/))) {
      if (!(await rateLimit(env, req))) return new Response('Rate limited', {status:429, headers:baseHeaders(env)});
      const ACTION = m[1]; const X = parseInt(m[2],10), Y = parseInt(m[3],10), sid = decodeURIComponent(m[4]);
      const ev = await writeEvent(env, sid, `/C/${ACTION}`, { X, Y, action:ACTION, mode:'one-shot' }, 'ok', reason, req);
      return fmtJSON ? json(ev) : ok(env, `/C/${ACTION}`, sid, { X, Y, ACTION, reason });
    }

    // ===== Board HTML/JSON/SSE =====
    if ((m = url.pathname.match(/^\/board_html\/([^/]+)$/))) {
      const sid = decodeURIComponent(m[1]);
      const events = await listEvents(env, sid, 50);
      const rows = events.map(e => `${e.ts}  ${e.route}  ${e.status.toUpperCase()}  ${JSON.stringify(e.payload)}`).join('\n');
      return htmlList(env, '/board_html', sid, 'EVENTS (newest first)', rows);
    }
    if ((m = url.pathname.match(/^\/board_json\/([^/]+)$/))) {
      const sid = decodeURIComponent(m[1]);
      const limit = Math.min(parseInt(url.searchParams.get('limit')||'50',10), 200);
      const events = await listEvents(env, sid, limit);
      return json({ sid, version: env.SERVICE_VERSION||'v3.1', events }, { headers: corsHeaders(env) });
    }
    if ((m = url.pathname.match(/^\/sse\/board\/([^/]+)$/))) {
      const sid = decodeURIComponent(m[1]);
      const stream = new ReadableStream({
        async start(controller) {
          const enc = (s)=> new TextEncoder().encode(s);
          controller.enqueue(enc('event: hello\ndata: {"ok":true}\n\n'));
          const snap = await listEvents(env, sid, 20);
          controller.enqueue(enc(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`));
          const t = setInterval(()=>controller.enqueue(enc(`event: ping\ndata: "${new Date().toISOString()}"\n\n`)), 15000);
          // Не забываем GC при закрытии соединения
          // Упрощённо: CF сам закроет при разрыве; таймер самоочистится по таймауту воркера.
        }
      });
      return new Response(stream, {
        headers: {
          'Content-Type':'text/event-stream; charset=utf-8',
          'Cache-Control':'no-store',
          'Connection':'keep-alive',
          ...corsHeaders(env),
          'X-Service': env.SERVICE_NAME||'eiroslink',
          'X-Version': env.SERVICE_VERSION||'v3.1'
        }
      });
    }

    // ===== Proxy to origin for unknown routes (опционально) =====
    if (env.PROXY_ORIGIN) {
      const target = `${env.PROXY_ORIGIN}${url.pathname}${url.search}`;
      return fetch(target, { headers: req.headers, method: req.method });
    }

    // ===== Canonical placeholder /h/* =====
    if (url.pathname.startsWith('/h/')) {
      const parts = url.pathname.split('/');
      const route = `/h/${parts[2]||''}`;
      const sid   = parts[3] ? decodeURIComponent(parts[3]) : 'SESSION';
      const ev    = await writeEvent(env, sid, route, { placeholder:true, path:url.pathname }, 'placeholder', reason, req);
      return fmtJSON ? json(ev) : ok(env, route, sid, { status:'placeholder', DETAIL:'canonical placeholder', reason });
    }

    return new Response('<pre>Not Found</pre>', { status: 404, headers: baseHeaders(env) });
  }
};