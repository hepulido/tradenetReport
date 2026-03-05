// Load .env FIRST before any other imports that might read env vars
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Explicit dotenv loading with path resolution
const envPath = process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), ".env");
const envExists = fs.existsSync(envPath);
dotenv.config({ path: envPath });

// Development startup log (safe - no secrets)
if (process.env.NODE_ENV !== "production") {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  console.log("[env] ========== Environment Check ==========");
  console.log(`[env] cwd: ${process.cwd()}`);
  console.log(`[env] .env path: ${envPath}`);
  console.log(`[env] .env exists: ${envExists}`);
  console.log(`[env] LLM_PROVIDER: ${process.env.LLM_PROVIDER || "(not set)"}`);
  console.log(`[env] ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL || "(not set)"}`);
  console.log(`[env] ANTHROPIC_API_KEY prefix: ${anthropicKey ? anthropicKey.slice(0, 7) + "..." : "(not set)"}`);
  console.log(`[env] ANTHROPIC_API_KEY valid format: ${anthropicKey?.startsWith("sk-ant-") ? "YES" : "NO - must start with sk-ant-"}`);
  console.log(`[env] OPENAI_API_KEY prefix: ${openaiKey ? openaiKey.slice(0, 6) + "..." : "(not set)"}`);
  console.log("[env] ==========================================");
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";


const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
