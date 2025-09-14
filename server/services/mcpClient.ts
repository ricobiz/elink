// mcp-client.ts
// Единый клиент для MCP Bridge с таймаутами, ретраями, безопасной навигацией, generic-результатами.

export type MCPActionType =
  | 'navigate'
  | 'wait_for'
  | 'type'
  | 'click'
  | 'press'
  | 'select'
  | 'eval_js'
  | 'screenshot'
  | 'coords_click'
  | 'scroll'
  | 'get_url'
  | 'get_title';

export interface MCPAction {
  type: MCPActionType;
  params?: Record<string, any>;
}

export interface MCPBridgeResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MCPResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
  statusCode?: number;
  requestId?: string;
  attempt?: number;
  retries?: number;
  bytesIn?: number;
  bytesOut?: number;
}

export interface MCPClientOptions {
  /** Полный base URL, например: https://eiros.link  */
  baseUrl?: string;
  /** Bearer-токен или любой другой auth-секрет */
  token?: string;
  /** Заголовки по умолчанию */
  defaultHeaders?: Record<string, string>;
  /** Таймаут на запрос, мс */
  timeoutMs?: number; // default 60000
  /** Макс. кол-во ретраев на 429/5xx/сетевые ошибки */
  maxRetries?: number; // default 2
  /** База задержки ретрая, мс (экспоненциально) */
  retryDelayMs?: number; // default 400
  /** Разрешённые домены для navigate (если задан — валидация включена) */
  allowDomains?: string[];
}

function readEnv(name: string): string | undefined {
  try {
    // В браузере process может быть undefined; в Next — заменится при сборке
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = typeof globalThis !== 'undefined' ? globalThis : (window as any);
    const p = typeof process !== 'undefined' ? (process as any) : g?.process;
    return p?.env?.[name];
  } catch {
    return undefined;
  }
}

function normalizeBaseUrl(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim().replace(/\/+$/, '');
  try {
    const u = new URL(trimmed);
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http/https allowed');
    return u.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid baseUrl: ${input}`);
  }
}

function genId(len = 16): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export class MCPClient {
  private baseUrl: string;
  private token?: string;
  private defaultHeaders: Record<string, string>;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private allowDomains?: string[];

  constructor(opts: MCPClientOptions = {}) {
    const envBase =
      readEnv('NEXT_PUBLIC_MCP_BROWSER_URL') ||
      readEnv('MCP_BROWSER_URL') ||
      'http://localhost:5000';

    this.baseUrl = normalizeBaseUrl(opts.baseUrl || envBase)!;
    this.token = opts.token;
    this.defaultHeaders = opts.defaultHeaders || {};
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 400;
    this.allowDomains = opts.allowDomains;
  }

  private buildHeaders(extra?: Record<string, string>, idempotency?: string): Headers {
    const h = new Headers({
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...extra,
    });
    if (this.token) h.set('Authorization', `Bearer ${this.token}`);
    if (idempotency) h.set('Idempotency-Key', idempotency);
    return h;
  }

  private async parseBody(resp: Response): Promise<{ data?: unknown; errorText?: string; bytesIn?: number }> {
    const ct = resp.headers.get('content-type') || '';
    const buffer = await resp.arrayBuffer().catch(() => undefined);
    const bytesIn = buffer ? buffer.byteLength : undefined;
    if (!buffer) return { data: undefined, bytesIn };

    // JSON
    if (ct.includes('application/json')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dec = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
        return { data: JSON.parse(dec), bytesIn };
      } catch (e) {
        const txt = new TextDecoder('utf-8').decode(new Uint8Array(buffer)).slice(0, 512);
        return { errorText: `Invalid JSON (${txt})`, bytesIn };
      }
    }

    // Текст
    if (ct.startsWith('text/')) {
      const txt = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      return { data: txt, bytesIn };
    }

    // Бинарь: вернём base64 для лога, но лучше отдавать ссылку из бекенда
    const b64 = typeof Buffer !== 'undefined'
      // @ts-ignore Buffer в node
      ? (Buffer.from(buffer as ArrayBuffer).toString('base64') as string)
      : btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return { data: { base64: b64, contentType: ct }, bytesIn };
  }

  private shouldRetry(status: number) {
    return status === 429 || (status >= 500 && status <= 599);
  }

  private async request<T = unknown>(
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    timeoutMs = this.timeoutMs
  ): Promise<MCPResult<T>> {
    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    const id = genId(12);
    const idempotency = genId(16);

    let attempt = 0;
    let lastError: string | undefined;
    let bytesOut: number | undefined;

    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    if (payload) bytesOut = new TextEncoder().encode(payload).length;

    try {
      while (attempt <= this.maxRetries) {
        attempt++;

        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(extraHeaders, idempotency),
            body: payload,
            signal: controller.signal,
          });

          const { data, errorText, bytesIn } = await this.parseBody(resp);

          // Попробуем распарсить как мостовой ответ, если это JSON-объект
          let bridge: MCPBridgeResponse<T> | undefined;
          if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            bridge = data as MCPBridgeResponse<T>;
          }

          const duration = Date.now() - started;

          if (!resp.ok) {
            const bodyErr =
              bridge?.error ||
              errorText ||
              (typeof data === 'string' ? data.slice(0, 256) : undefined) ||
              resp.statusText;

            if (this.shouldRetry(resp.status) && attempt <= this.maxRetries) {
              const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
              await sleep(delay);
              continue;
            }

            return {
              success: false,
              error: bodyErr || 'Request failed',
              duration,
              statusCode: resp.status,
              requestId: id,
              attempt,
              retries: attempt - 1,
              bytesIn,
              bytesOut,
            };
          }

          // ok
          const success =
            bridge?.success !== undefined ? !!bridge.success : true;

          return {
            success,
            data: (bridge?.data as T) ?? (data as T),
            duration,
            statusCode: resp.status,
            requestId: id,
            attempt,
            retries: attempt - 1,
            bytesIn,
            bytesOut,
          };
        } catch (e) {
          lastError = e instanceof Error ? e.message : 'Network/Abort error';
          if (attempt <= this.maxRetries) {
            const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
            await sleep(delay);
            continue;
          }
          const duration = Date.now() - started;
          return {
            success: false,
            error: lastError,
            duration,
            statusCode: undefined,
            requestId: id,
            attempt,
            retries: attempt - 1,
            bytesIn: undefined,
            bytesOut,
          };
        }
      }

      // не должно дойти
      const duration = Date.now() - started;
      return {
        success: false,
        error: lastError || 'Unknown error',
        duration,
        requestId: id,
        attempt,
        retries: attempt - 1,
        bytesIn: undefined,
        bytesOut,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ====== ПУБЛИЧНЫЕ МЕТОДЫ ===================================================

  async executeAction<T = unknown>(sessionId: string, action: MCPAction, extraHeaders?: Record<string, string>): Promise<MCPResult<T>> {
    return this.request<T>('/api/mcp/execute', { sessionId, action }, extraHeaders);
  }

  async takeScreenshot(
    sessionId: string,
    opts?: { fullPage?: boolean; selector?: string; clip?: { x: number; y: number; width: number; height: number }; format?: 'png' | 'jpeg' }
  ): Promise<MCPResult<{ imageUrl?: string; base64?: string }>> {
    return this.executeAction(sessionId, { type: 'screenshot', params: opts });
  }

  /** Координаты ожидаются в CSS-пикселях относительно viewport удалённого браузера */
  async clickCoordinates(sessionId: string, x: number, y: number): Promise<MCPResult> {
    return this.executeAction(sessionId, { type: 'coords_click', params: { x, y, units: 'csspx' } });
  }

  async click(sessionId: string, selector: string, opts?: { button?: 'left' | 'right' | 'middle'; clickCount?: number; delayMs?: number }): Promise<MCPResult> {
    return this.executeAction(sessionId, { type: 'click', params: { selector, ...opts } });
  }

  async typeText(sessionId: string, text: string, opts?: { delayMs?: number; submit?: boolean }): Promise<MCPResult> {
    return this.executeAction(sessionId, { type: 'type', params: { text, ...opts } });
  }

  async pressKey(sessionId: string, key: string, opts?: { modifiers?: Array<'Shift' | 'Alt' | 'Meta' | 'Control'>; durationMs?: number }): Promise<MCPResult> {
    return this.executeAction(sessionId, { type: 'press', params: { key, ...opts } });
  }

  async selectOption(sessionId: string, selector: string, valueOrLabel: { value?: string; label?: string; index?: number }): Promise<MCPResult> {
    return this.executeAction(sessionId, { type: 'select', params: { selector, ...valueOrLabel } });
  }

  async waitFor(sessionId: string, selector: string, opts?: { state?: 'visible' | 'attached' | 'hidden' | 'detached'; timeoutMs?: number }): Promise<MCPResult> {
    return this.executeAction(sessionId, { type: 'wait_for', params: { selector, ...opts } });
  }

  async evalJS<T = unknown>(sessionId: string, expression: string, opts?: { sandbox?: boolean }): Promise<MCPResult<T>> {
    // sandbox=true — просим бэк ограничить доступ (лучше whitelist выражений)
    return this.executeAction<T>(sessionId, { type: 'eval_js', params: { expression, ...opts } });
  }

  async navigateTo(sessionId: string, url: string): Promise<MCPResult> {
    if (!isHttpUrl(url)) {
      return { success: false, error: 'Only http/https URLs are allowed' };
    }
    if (this.allowDomains && this.allowDomains.length) {
      const host = hostnameOf(url);
      if (!host || !this.allowDomains.some((d) => host === d || host.endsWith(`.${d}`))) {
        return { success: false, error: `Navigation to ${host} is not allowed by policy` };
      }
    }
    return this.executeAction(sessionId, { type: 'navigate', params: { url } });
  }

  async getCurrentUrl(sessionId: string): Promise<MCPResult<string>> {
    return this.executeAction<string>(sessionId, { type: 'get_url' });
  }

  async getPageTitle(sessionId: string): Promise<MCPResult<string>> {
    return this.executeAction<string>(sessionId, { type: 'get_title' });
  }

  async scrollPage(sessionId: string, direction: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<MCPResult> {
    return this.executeAction(sessionId, { type: 'scroll', params: { direction, amount } });
  }

  // ====== ВСПОМОГАТЕЛЬНОЕ: простейшая генерация плана на натуральном языке ===

  async generatePlan({ sessionId, humanCommand }: { sessionId: string; humanCommand: string; }): Promise<MCPAction[]> {
    const c = humanCommand.toLowerCase();

    // базовые паттерны
    if (/\b(screenshot|скрин|снимок)\b/.test(c)) return [{ type: 'screenshot' }];
    if (/\bscroll up\b|прокрути вверх/.test(c)) return [{ type: 'scroll', params: { direction: 'up', amount: 600 } }];
    if (/\bscroll down\b|прокрути вниз/.test(c)) return [{ type: 'scroll', params: { direction: 'down', amount: 600 } }];
    if (/\bget url\b|какой урл/.test(c)) return [{ type: 'get_url' }];
    if (/\bget title\b|какой заголовок/.test(c)) return [{ type: 'get_title' }];

    // навигация + ожидание готовности
    const navMatch = c.match(/\b(?:go to|open|перейди на|открой)\s+(https?:\/\/\S+)/);
    if (navMatch?.[1]) {
      return [
        { type: 'navigate', params: { url: navMatch[1] } },
        { type: 'wait_for', params: { selector: 'body', state: 'visible', timeoutMs: 15_000 } },
        { type: 'screenshot' },
      ];
    }

    // по умолчанию — безопасный скрин
    return [{ type: 'screenshot' }];
  }

  // Выполнение плана последовательно с базовой остановкой по ошибке
  async executePlan<T = unknown>(sessionId: string, actions: MCPAction[]): Promise<MCPResult<T>[]> {
    const results: MCPResult<T>[] = [];
    for (const a of actions) {
      const r = await this.executeAction<T>(sessionId, a);
      results.push(r);
      if (!r.success) break;
    }
    return results;
  }
}

// Удобный фабричный экспорт — по умолчанию берёт URL из env, см. конструктор
export const mcpClient = new MCPClient();