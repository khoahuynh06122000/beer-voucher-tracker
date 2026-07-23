import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleDailyReportHandler } from "../scheduled";

async function startServer() {
  const app = express();
  const server = createServer(app);
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
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  const listenOnPort = () => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${port}/`);
    });
  };

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${port} is busy, retrying in 500ms...`);
      setTimeout(() => {
        server.close();
        listenOnPort();
      }, 500);
    } else {
      console.error("Server error:", err);
    }
  });

  listenOnPort();
}

startServer().catch(console.error);
