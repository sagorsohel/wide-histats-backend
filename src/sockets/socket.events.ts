import { getSocketServer } from "./socket.server.js";
import { realtimeService } from "../services/realtime.service.js";

export class SocketEvents {
  static emitPageView(websiteId: string, eventData: any) {
    const io = getSocketServer();
    if (!io) return;

    const room = `website:${websiteId}`;
    io.to(room).emit("website:pageview", {
      websiteId,
      ...eventData,
      timestamp: new Date().toISOString(),
    });
  }

  static emitVisitorActivity(websiteId: string) {
    const io = getSocketServer();
    if (!io) return;

    const room = `website:${websiteId}`;
    const activeCount = realtimeService.getActiveCount(websiteId);
    const activeCount5m = realtimeService.getActiveCount(websiteId, 5 * 60 * 1000);
    const activeCount15m = realtimeService.getActiveCount(websiteId, 15 * 60 * 1000);
    const activeVisitors = realtimeService.getActiveVisitors(websiteId);

    io.to(room).emit("website:realtime_update", {
      websiteId,
      activeCount,
      activeCount5m,
      activeCount15m,
      activeVisitors,
    });
  }
}
