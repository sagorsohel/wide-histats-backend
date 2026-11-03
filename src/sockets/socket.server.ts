import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/jwt.js";
import { db } from "../db/index.js";
import { websites } from "../db/schema/websites.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { realtimeService } from "../services/realtime.service.js";

let io: SocketIOServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*", // or configured CORS origin
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer /, "");

      if (!token) {
        // Allow unauthenticated socket connection if viewing public website stats, or reject
        return next();
      }

      const payload = verifyAccessToken(token);
      if (payload) {
        (socket as any).userId = payload.userId;
      }
      next();
    } catch (err) {
      next();
    }
  });

  io.on("connection", (socket: Socket) => {
    logger.debug(`Socket client connected: ${socket.id}`);

    // Dynamic token authentication without reconnect
    socket.on("auth:token", (token: string) => {
      try {
        if (!token) {
          (socket as any).userId = undefined;
          return;
        }
        const payload = verifyAccessToken(token);
        if (payload) {
          (socket as any).userId = payload.userId;
          logger.debug(`Socket ${socket.id} dynamically authenticated for user ${payload.userId}`);
        }
      } catch (err: any) {
        logger.warn(`Socket dynamic auth failed: ${err.message}`);
      }
    });

    // Join room for a specific website
    socket.on("subscribe:website", async (websiteId: string) => {
      try {
        if (!websiteId) return;

        // Leave any previously joined website rooms to guarantee 100% data isolation
        for (const room of socket.rooms) {
          if (room.startsWith("website:") && room !== `website:${websiteId}`) {
            socket.leave(room);
            logger.debug(`Socket ${socket.id} automatically left previous room ${room}`);
          }
        }

        const userId = (socket as any).userId;

        // Verify website exists
        const [website] = await db
          .select()
          .from(websites)
          .where(eq(websites.id, websiteId))
          .limit(1);

        if (!website) {
          socket.emit("error", { message: "Website not found." });
          return;
        }

        // Check permission if website is private
        if (!website.isPublic && (!userId || website.userId !== userId)) {
          socket.emit("error", { message: "Unauthorized website subscription." });
          return;
        }

        const room = `website:${websiteId}`;
        socket.join(room);
        logger.debug(`Socket ${socket.id} joined room ${room}`);

        // Emit current active visitor state immediately
        let activeCount = realtimeService.getActiveCount(websiteId);
        if (activeCount === 0) {
          await realtimeService.syncFromDatabase(websiteId);
          activeCount = realtimeService.getActiveCount(websiteId);
        }
        const activeVisitors = realtimeService.getActiveVisitors(websiteId);
        const activeCount5m = realtimeService.getActiveCount(websiteId, 5 * 60 * 1000);
        const activeCount15m = realtimeService.getActiveCount(websiteId, 15 * 60 * 1000);
        socket.emit("website:realtime_init", {
          websiteId,
          activeCount,
          activeCount5m,
          activeCount15m,
          activeVisitors,
        });
      } catch (err: any) {
        logger.error(`Error subscribing to website: ${err.message}`);
      }
    });

    socket.on("unsubscribe:website", (websiteId: string) => {
      const room = `website:${websiteId}`;
      socket.leave(room);
      logger.debug(`Socket ${socket.id} left room ${room}`);
    });

    socket.on("disconnect", () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Automatically broadcast real-time visitor activity whenever in-memory counts change
  realtimeService.onActivity((websiteId: string) => {
    if (!io) return;
    const room = `website:${websiteId}`;
    const activeCount = realtimeService.getActiveCount(websiteId);
    const activeVisitors = realtimeService.getActiveVisitors(websiteId);
    io.to(room).emit("website:realtime_update", {
      websiteId,
      activeCount,
      activeVisitors,
    });
  });

  logger.info("Socket.IO server initialized successfully.");
  return io;
};

export const getSocketServer = (): SocketIOServer | null => {
  return io;
};
