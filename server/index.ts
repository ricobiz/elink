// index.ts
import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { mcpHttpBridge } from "./services/mcpHttpBridge";
import { repldbService } from "./services/repldbService";
import viteConfig from "../vite.config";

const viteLogger = createLogger();

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Роуты, которые НЕ должны уходить в SPA/Vite */
const BYPASS_PREFIXES = [
  "/ai-status",
  "/ai-access", 
  "/health",
  "/h",
  "/api",
  "/w",
  "/r",
];

/** Vite dev ассеты/служебные */
function isViteDevAsset(url: string): boolean {
  if (url.startsWith("/@vite") || url.startsWith("/@id")) return true;
  if (url.startsWith("/src/") || url.startsWith("/node_modules/")) return true;
  const ext = path.extname(url).toLowerCase();
  if (!ext) return false;
  return [
    ".js",
    ".ts", 
    ".tsx",
    ".jsx",
    ".mjs",
    ".cjs",
    ".css",
    ".scss",
    ".sass",
    ".map",
    ".json",
    ".svg",
    ".png",
    ".jpg", 
    ".jpeg",
    ".gif",
    ".ico",
    ".webp",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".wasm",
  ].includes(ext);
}

/** SPA-путь: без расширения и не в BYPASS */
function isSpaPath(url: string): boolean {
  for (const p of BYPASS_PREFIXES) {
    if (url === p || url.startsWith(p + "/")) return false;
  }
  return path.extname(url) === "";
}

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit", 
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

const app = express();

// корректные IP за прокси
app.set("trust proxy", true);

// базовые парсеры
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// лёгкий логгер только для /api/*
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJson: Record<string, any> | undefined;

  const originalJson = res.json.bind(res);
  res.json = (body: any, ...args: any[]) => {
    capturedJson = body;
    return originalJson.call(res, body);
  };

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      const ms = Date.now() - start;
      let line = `${req.method} ${path} ${res.statusCode} in ${ms}ms`;
      if (capturedJson) {
        const s = JSON.stringify(capturedJson);
        if (s) line += ` :: ${s}`;
      }
      if (line.length > 200) line = line.slice(0, 199) + "…";
      log(line);
    }
  });

  next();
});

/** ─────────────────────────────────────────────────────────
 *  1) РАННИЕ HEALTH/AI-ВХОДЫ (НЕ ДАТЬ ПЕРЕХВАТИТЬ VITE)
 *  ──────────────────────────────────────────────────────── */
app.get("/h/health", (_req, res) => {
  res.type("application/json").send({
    service: "app",
    route: "/h/health",
    status: "ok",
    ts: new Date().toISOString(),
  });
});

app.get("/ai-status", (_req, res) => {
  res.type("application/json").send({
    status: "operational",
    service: "APP",
    source: "express",
    ts: new Date().toISOString(),
  });
});

app.get("/ai-access", (_req, res) => {
  res
    .status(200)
    .type("html")
    .send(
      `<!doctype html><meta charset="utf-8"/>
<title>EIROS LINK — APP ACCESS</title>
<style>body{font-family:ui-monospace,monospace;background:#0f172a;color:#e2e8f0;padding:24px}</style>
<h1>EIROS LINK — APP ACCESS</h1>
<ul>
  <li><a href="/ai-status">/ai-status</a></li>
  <li><a href="/h/health">/h/health</a></li>
</ul>
<pre>OK • ${new Date().toISOString()}</pre>`,
    );
});

/** ─────────────────────────────────────────────────────────
 *  2) MCP HTTP Bridge ДО всех прочих роутов
 *  ──────────────────────────────────────────────────────── */
try {
  app.use("/api/mcp", mcpHttpBridge.app);
  log("🌉 MCP HTTP Bridge integrated at /api/mcp");
} catch (err) {
  log(
    "Failed to integrate MCP HTTP Bridge: " +
      (err instanceof Error ? err.message : String(err)),
  );
}

/** ─────────────────────────────────────────────────────────
 *  LOCAL VITE FUNCTIONS (bypassing blocked vite.ts)
 *  ──────────────────────────────────────────────────────── */

async function setupViteLocal(app: express.Application, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: false, // Completely disable HMR - incompatible with Replit proxy
    cors: true,
    allowedHosts: true as const,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  };
  
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Не валим процесс
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Селективный вызов Vite
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const url = req.path || req.originalUrl || "/";

    // 1) API/health/команды — пропускаем дальше
    for (const p of BYPASS_PREFIXES) {
      if (url === p || url.startsWith(p + "/")) return next();
    }

    // 2) Vite dev ассеты — отдаёт Vite
    if (isViteDevAsset(url)) {
      return (vite.middlewares as any)(req, res, next);
    }

    // 3) SPA — Vite ассеты → index.html
    if (isSpaPath(url)) {
      return (vite.middlewares as any)(req, res, async (err: any) => {
        if (err) return next(err);
        try {
          const clientTemplate = path.resolve(
            __dirname,
            "..",
            "client",
            "index.html",
          );
          let template = await fs.promises.readFile(clientTemplate, "utf-8");
          template = template.replace(
            `src="/src/main.tsx"`,
            `src="/src/main.tsx?v=${nanoid()}"`,
          );
          const page = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(page);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    }

    // 4) Иначе — вниз по цепочке
    return next();
  });
}

function serveStaticLocal(app: express.Application) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  log(`📁 Static files path: ${distPath}`);
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { fallthrough: true }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const url = req.path || req.originalUrl || "/";
    for (const p of BYPASS_PREFIXES) {
      if (url === p || url.startsWith(p + "/")) return next();
    }
    if (path.extname(url) !== "") return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

/** ─────────────────────────────────────────────────────────
 *  3) ОСНОВНЫЕ РОУТЫ ПРИЛОЖЕНИЯ
 *  ──────────────────────────────────────────────────────── */
const startServer = async () => {
  // registerRoutes должен вернуть http.Server
  const server = await registerRoutes(app);

  /** ─────────────────────────────────────────────────────
   *  4) Error handler (не валим процесс после ответа)
   *  ─────────────────────────────────────────────────── */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message =
      err?.message || (status === 404 ? "Not Found" : "Internal Server Error");
    // логнем аккуратно
    try {
      log(`ERR ${status} :: ${message}`);
    } catch {}
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  /** ─────────────────────────────────────────────────────
   *  5) Vite/Static — СТРОГО ПОСЛЕ всех API/health/MCP
   *     (setupViteLocal внутри себя уже защищает /ai-*, /h/* и др.)
   *  ─────────────────────────────────────────────────── */
  // Принудительно используем статический режим в Replit для полной стабильности
  const forceStatic = true; // FORCE static mode to eliminate all WebSocket issues
  if (forceStatic || process.env.NODE_ENV !== "development") {
    serveStaticLocal(app);
    log("📦 Using static build mode (Replit optimized - no WebSocket issues)");
  } else {
    await setupViteLocal(app, server);
    log("🔧 Using safe Vite dev server (bypassed problematic HMR settings)");
  }

  /** ─────────────────────────────────────────────────────
   *  6) REPLDB INITIALIZATION
   *  ─────────────────────────────────────────────────── */
  try {
    await repldbService.connect();
    log('✅ ReplDB подключена успешно');
  } catch (error) {
    log(`❌ Не удалось подключиться к ReplDB: ${error instanceof Error ? error.message : String(error)}`);
    log('⚠️ Сервер продолжит работу без ReplDB');
  }

  /** ─────────────────────────────────────────────────────
   *  7) LISTEN (порт только из ENV)
   *  ─────────────────────────────────────────────────── */
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
};

void startServer();
