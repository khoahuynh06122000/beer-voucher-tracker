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
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Scheduled task handlers - must be before Vite/static fallthrough
  app.post("/api/scheduled/daily-report", handleDailyReportHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        console.error(`[tRPC Error] on path ${path}:`, error);
      },
    })
  );

  // Fallback handler for API routes to prevent falling through to Vite HTML
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Express API Error Handler - ensures all API errors return JSON
  app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[API Error Handler]:", err);
    res.status(err.status || err.statusCode || 500).json({
      error: {
        message: err.message || "Internal Server Error",
        code: err.code || "INTERNAL_SERVER_ERROR",
      },
    });
  });

  return app;
}
