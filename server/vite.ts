import express, {
  type Express,
  Request,
  Response,
  NextFunction,
} from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";

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

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: {
      server,
      port: 24678,
      host: "0.0.0.0",
      clientPort: 443,
      protocol: "wss",
    },
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

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
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
