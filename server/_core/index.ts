import "dotenv/config";
import { createServer } from "http";
import { createExpressApp } from "./app.js";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = createExpressApp();
  const server = createServer(app);

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
