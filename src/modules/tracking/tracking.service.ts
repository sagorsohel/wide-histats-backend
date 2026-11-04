import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { websites } from "../../db/schema/websites.js";
import { visitors } from "../../db/schema/visitors.js";
import { sessions } from "../../db/schema/sessions.js";
import { pageviews } from "../../db/schema/pageviews.js";
import { visitorLocations } from "../../db/schema/visitor-locations.js";
import { events } from "../../db/schema/events.js";
import {
  TrackPageViewInput,
  TrackHeartbeatInput,
  TrackEventInput,
} from "./tracking.schema.js";
import { DeviceService } from "../../services/device.service.js";
import { GeolocationService } from "../../services/geolocation.service.js";
import { AttributionService } from "../../services/attribution.service.js";
import { realtimeService } from "../../services/realtime.service.js";
import { SocketEvents } from "../../sockets/socket.events.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { logger } from "../../utils/logger.js";

interface CachedWebsite {
  id: string;
  status: string;
  domain: string;
  cachedAt: number;
}

export class TrackingService {
  private static websiteCache = new Map<string, CachedWebsite>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  static async getWebsiteByTrackingId(trackingId: string) {
    const cached = this.websiteCache.get(trackingId);
    const now = Date.now();
    if (cached && now - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached;
    }

    const [website] = await db
      .select({
        id: websites.id,
        status: websites.status,
        domain: websites.domain,
      })
      .from(websites)
      .where(eq(websites.trackingId, trackingId))
      .limit(1);

    if (website) {
      this.websiteCache.set(trackingId, {
        ...website,
        cachedAt: now,
      });
    }

    return website;
  }

  static invalidateWebsiteCache(trackingId?: string) {
    if (trackingId) {
      this.websiteCache.delete(trackingId);
    } else {
      this.websiteCache.clear();
    }
  }

  static async recordPageView(
    input: TrackPageViewInput,
    ip?: string,
    userAgent?: string
  ) {
    // 1. Validate Website (with in-memory cache for speed)
    const website = await this.getWebsiteByTrackingId(input.websiteId);

    if (!website || website.status !== "active") {
      throw new Error("Invalid or inactive website tracking identifier.");
    }

    // 2. Parse User Agent & Geolocation & Attribution
    const device = DeviceService.parse(userAgent);
    const geo = GeolocationService.resolve(ip);
    const attribution = AttributionService.resolve(
      input.referrer,
      input.url,
      input.utmSource,
      input.utmMedium,
      input.utmCampaign
    );

    const now = new Date();

    // 3. Find or atomic upsert Visitor
    const [visitor] = await db
      .insert(visitors)
      .values({
        websiteId: website.id,
        visitorKey: input.visitorKey,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [visitors.websiteId, visitors.visitorKey],
        set: { lastSeenAt: now },
      })
      .returning();

    if (!visitor) {
      return { status: "error", message: "Failed to resolve visitor" };
    }

    // If newly created visitor, record location
    const isNewVisitor = Math.abs(visitor.firstSeenAt.getTime() - visitor.lastSeenAt.getTime()) < 1000;
    if (isNewVisitor) {
      db.insert(visitorLocations)
        .values({
          websiteId: website.id,
          visitorId: visitor.id,
          countryCode: geo.countryCode,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          latitude: geo.latitude,
          longitude: geo.longitude,
        })
        .catch(() => {});
    }

    // 4. Find or create Session
    let [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.websiteId, website.id),
          eq(sessions.sessionKey, input.sessionKey)
        )
      )
      .limit(1);

    if (!session) {
      try {
        [session] = await db
          .insert(sessions)
          .values({
            websiteId: website.id,
            visitorId: visitor.id,
            sessionKey: input.sessionKey,
            source: attribution.source,
            medium: attribution.medium,
            campaign: attribution.campaign,
            referrer: input.referrer || null,
            landingPage: input.path || "/",
            exitPage: input.path || "/",
            browser: device.browser,
            browserVersion: device.browserVersion,
            os: device.os,
            osVersion: device.osVersion,
            deviceType: device.deviceType,
            ipAddress: ip || null,
            startedAt: now,
            lastSeenAt: now,
          })
          .returning();
      } catch (err: any) {
        // Race condition: concurrent hit already created this session
        [session] = await db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.websiteId, website.id),
              eq(sessions.sessionKey, input.sessionKey)
            )
          )
          .limit(1);
      }
    } else {
      // Async update session exit page, last seen and ip (non-blocking)
      db.update(sessions)
        .set({
          lastSeenAt: now,
          exitPage: input.path || "/",
          ...(ip ? { ipAddress: ip } : {}),
        })
        .where(eq(sessions.id, session.id))
        .catch(() => {});
    }

    // 5. Insert Pageview
    const [pageview] = await db
      .insert(pageviews)
      .values({
        websiteId: website.id,
        visitorId: visitor.id,
        sessionId: session.id,
        pageUrl: input.url,
        pagePath: input.path || "/",
        pageTitle: input.title || "",
        referrer: input.referrer || null,
        viewedAt: now,
      })
      .returning();

    // 6. Realtime Tracking In-Memory & Socket.IO
    realtimeService.recordActivity(website.id, {
      visitorKey: input.visitorKey,
      sessionKey: input.sessionKey,
      currentPath: input.path || "/",
      pageTitle: input.title,
      pageUrl: input.url,
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      source: attribution.source,
      ip: ip || "127.0.0.1",
    });

    SocketEvents.emitPageView(website.id, {
      path: input.path || "/",
      title: input.title || "",
      url: input.url,
      visitorKey: input.visitorKey,
      referrer: input.referrer,
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
      browser: device.browser,
      os: device.os,
      deviceType: device.deviceType,
      source: attribution.source,
      ip: ip || "127.0.0.1",
      hitsCount: realtimeService.getVisitorPageviews(website.id, input.visitorKey),
    });

    SocketEvents.emitVisitorActivity(website.id);

    return {
      status: "recorded",
      pageviewId: pageview.id,
      sessionId: session.id,
      visitorId: visitor.id,
    };
  }

  static async recordHeartbeat(input: TrackHeartbeatInput) {
    try {
      const website = await this.getWebsiteByTrackingId(input.websiteId);
      if (!website) return { status: "ignored" };

      // Update in-memory realtime tracker and emit socket update immediately (zero DB delay)
      realtimeService.heartbeat(website.id, input.visitorKey, input.path);
      SocketEvents.emitVisitorActivity(website.id);

      // Persist lastSeenAt in DB asynchronously with catch to prevent 500s on transient DB hiccups
      db.update(sessions)
        .set({
          lastSeenAt: new Date(),
          ...(input.path ? { exitPage: input.path } : {}),
        })
        .where(
          and(
            eq(sessions.websiteId, website.id),
            eq(sessions.sessionKey, input.sessionKey)
          )
        )
        .catch((err) => {
          logger.warn(`Heartbeat DB sync warning: ${err?.message || err}`);
        });

      return { status: "heartbeat_acknowledged" };
    } catch (err: any) {
      logger.warn(`Heartbeat error: ${err?.message || err}`);
      return { status: "ignored" };
    }
  }

  static async recordEvent(input: TrackEventInput) {
    const [website] = await db
      .select({ id: websites.id })
      .from(websites)
      .where(eq(websites.trackingId, input.websiteId))
      .limit(1);

    if (!website) {
      throw new Error("Invalid tracking ID");
    }

    const [visitor] = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(
        and(
          eq(visitors.websiteId, website.id),
          eq(visitors.visitorKey, input.visitorKey)
        )
      )
      .limit(1);

    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.websiteId, website.id),
          eq(sessions.sessionKey, input.sessionKey)
        )
      )
      .limit(1);

    if (!visitor || !session) {
      throw new Error("Visitor or session not registered before tracking custom event.");
    }

    const [event] = await db
      .insert(events)
      .values({
        websiteId: website.id,
        visitorId: visitor.id,
        sessionId: session.id,
        eventName: input.eventName,
        eventData: input.eventData,
      })
      .returning();

    return { status: "recorded", eventId: event.id };
  }
}
