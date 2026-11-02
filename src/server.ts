import http from "http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSocketServer } from "./sockets/socket.server.js";
import { checkDatabaseConnection, pool } from "./db/index.js";
import { ensureAdminSeed } from "./db/seed.js";
import { AggregationService } from "./services/aggregation.service.js";
import { logger } from "./utils/logger.js";

const startServer = async () => {
  const app = createApp();
  const httpServer = http.createServer(app);

  // Initialize Socket.IO on the same HTTP server
  initSocketServer(httpServer);

  // Verify DB connection
  const dbConnected = await checkDatabaseConnection();
  if (dbConnected) {
    // Automatically seed/ensure admin (admin@gmail.com / sohoj@sohoj) on start & restart
    await ensureAdminSeed();
  }

  // Start background daily stats aggregation service
  AggregationService.start();

  const PORT = env.PORT || 5000;
  const server = httpServer.listen(PORT, () => {
    logger.info(`Wide-Histat Analytics Server listening on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Tracking Script: http://localhost:${PORT}/tracker.js`);
    logger.info(`API Base URL: http://localhost:${PORT}/api/v1`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    AggregationService.stop();
    server.close(async () => {
      logger.info("HTTP server closed.");
      await pool.end();
      logger.info("Database pool closed.");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forceful shutdown after timeout.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection:", reason);
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
  });
};

startServer().catch((error) => {
  logger.error("Failed to start server:", error);
  process.exit(1);
});
