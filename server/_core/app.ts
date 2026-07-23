import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleDailyReportHandler } from "../scheduled";

export function createExpressApp() {
  const app = express();

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Request & Vercel URL rewrite normalizer middleware
  app.use((req, _res, next) => {
    // Log incoming requests for serverless debugging
    if (process.env.NODE_ENV !== "production" || req.url.includes("/api/trpc")) {
      console.log(`[Express] ${req.method} ${req.url} (originalUrl: ${req.originalUrl})`);
    }

    // On Vercel, rewrites like /api/(.*) -> /api can change req.url to /api
    if (req.originalUrl && (req.url === "/api" || req.url === "/api/" || req.url.startsWith("/api?"))) {
      req.url = req.originalUrl;
    }
    next();
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Scheduled task handlers - must be before Vite/static fallthrough
  app.post("/api/scheduled/daily-report", handleDailyReportHandler);

  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(`[tRPC Server Error] Path "${path}":`, error);
    },
  });

  // Mount tRPC at /api/trpc and /trpc fallback
  app.use("/api/trpc", trpcMiddleware);
  app.use("/trpc", trpcMiddleware);

  // Fallback handler for unmatched API routes - returning tRPC-friendly JSON array
  app.all("/api/*", (req, res) => {
    console.warn(`[Express API Fallback 404] Unmatched API path: ${req.method} ${req.url}`);
    res.status(404).json([
      {
        error: {
          message: `API route "${req.url}" not found.`,
          code: -32601,
          data: { code: "NOT_FOUND", httpStatus: 404 },
        },
      },
    ]);
  });

  // Express API Error Handler - ensures all server errors return tRPC JSON format instead of text/html
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Express Global Error Handler]:", err);
    res.status(err.status || err.statusCode || 500).json([
      {
        error: {
          message: err.message || "Internal Server Error",
          code: -32603,
          data: { code: "INTERNAL_SERVER_ERROR", httpStatus: err.status || 500 },
        },
      },
    ]);
  });

  return app;
}

