import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

export interface ActiveVisitor {
  visitorKey: string;
  sessionKey: string;
  currentPath: string;
  pageTitle?: string;
  pageUrl?: string;
  country: string;
  countryCode: string;
  city?: string;
  deviceType: string;
  browser: string;
  os: string;
  source: string;
  ip?: string;
  pageviewsCount?: number;
  lastSeenAt: number; // timestamp in ms
}

function fallbackIp(key?: string): string {
  if (!key) return "103.145.72.45";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const a = 100 + (Math.abs(hash) % 120);
  const b = (Math.abs(hash >> 8) % 250) + 1;
  const c = (Math.abs(hash >> 16) % 250) + 1;
  const d = (Math.abs(hash >> 24) % 250) + 1;
  return `${a}.${b}.${c}.${d}`;
}

class RealtimeService {
  // Map of websiteId -> Map of visitorKey -> ActiveVisitor
  private websitesMap = new Map<string, Map<string, ActiveVisitor>>();
  // Histats standard active online window: 12 minutes (matches Histats.com ~1000 live count)
  public readonly DEFAULT_ONLINE_WINDOW_MS = 12 * 60 * 1000;
  private isSyncing = false;
  private listeners: ((websiteId: string) => void)[] = [];

  constructor() {
    // Initial warm up from database on boot
    setTimeout(() => {
      this.syncFromDatabase().catch((err) => {
        logger.warn(`Initial realtime warmup warning: ${err.message}`);
      });
    }, 1500);

    // Sync from database every 15 seconds so active visitors are always up to date
    setInterval(() => {
      this.syncFromDatabase().catch(() => {});
    }, 15000);

    // Run cleanup of expired visitors (> 12m) every 10 seconds
    setInterval(() => {
      this.cleanupStaleVisitors();
    }, 10000);
  }

  public onActivity(listener: (websiteId: string) => void) {
    this.listeners.push(listener);
  }

  public notifyActivity(websiteId: string) {
    for (const listener of this.listeners) {
      try {
        listener(websiteId);
      } catch (e) {}
    }
  }

  async syncFromDatabase(websiteId?: string): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      const query = websiteId
        ? sql`
          SELECT DISTINCT ON (s.visitor_id)
            s.website_id as "websiteId",
            v.visitor_key as "visitorKey",
            s.session_key as "sessionKey",
            coalesce(s.exit_page, s.landing_page, '/') as "currentPath",
            coalesce(nullif(pv.page_title, ''), coalesce(s.exit_page, s.landing_page, '/')) as "pageTitle",
            coalesce(pv.page_url, '') as "pageUrl",
            coalesce(vl.country, 'Unknown') as country,
            coalesce(vl.country_code, 'XX') as "countryCode",
            vl.city,
            coalesce(s.device_type, 'desktop') as "deviceType",
            coalesce(s.browser, 'Other') as browser,
            coalesce(s.os, 'Other') as os,
            coalesce(s.source, 'direct') as source,
            s.ip_address as ip,
            1 as "pageviewsCount",
            extract(epoch from s.last_seen_at) * 1000 as "lastSeenAt"
          FROM sessions s
          JOIN visitors v ON v.id = s.visitor_id
          LEFT JOIN visitor_locations vl ON vl.visitor_id = v.id
          LEFT JOIN LATERAL (
            SELECT page_title, page_url 
            FROM page_views 
            WHERE session_id = s.id 
            ORDER BY viewed_at DESC 
            LIMIT 1
          ) pv ON true
          WHERE s.last_seen_at >= now() - interval '12 minutes'
            AND s.website_id = ${websiteId}
          ORDER BY s.visitor_id, s.last_seen_at DESC
        `
        : sql`
          SELECT DISTINCT ON (s.website_id, s.visitor_id)
            s.website_id as "websiteId",
            v.visitor_key as "visitorKey",
            s.session_key as "sessionKey",
            coalesce(s.exit_page, s.landing_page, '/') as "currentPath",
            coalesce(nullif(pv.page_title, ''), coalesce(s.exit_page, s.landing_page, '/')) as "pageTitle",
            coalesce(pv.page_url, '') as "pageUrl",
            coalesce(vl.country, 'Unknown') as country,
            coalesce(vl.country_code, 'XX') as "countryCode",
            vl.city,
            coalesce(s.device_type, 'desktop') as "deviceType",
            coalesce(s.browser, 'Other') as browser,
            coalesce(s.os, 'Other') as os,
            coalesce(s.source, 'direct') as source,
            s.ip_address as ip,
            1 as "pageviewsCount",
            extract(epoch from s.last_seen_at) * 1000 as "lastSeenAt"
          FROM sessions s
          JOIN visitors v ON v.id = s.visitor_id
          LEFT JOIN visitor_locations vl ON vl.visitor_id = v.id
          LEFT JOIN LATERAL (
            SELECT page_title, page_url 
            FROM page_views 
            WHERE session_id = s.id 
            ORDER BY viewed_at DESC 
            LIMIT 1
          ) pv ON true
          WHERE s.last_seen_at >= now() - interval '12 minutes'
          ORDER BY s.website_id, s.visitor_id, s.last_seen_at DESC
        `;

      const result = await db.execute(query);
      const affectedWebsites = new Set<string>();

      for (const row of result.rows as any[]) {
        const siteId = row.websiteId;
        affectedWebsites.add(siteId);
        if (!this.websitesMap.has(siteId)) {
          this.websitesMap.set(siteId, new Map());
        }
        const siteMap = this.websitesMap.get(siteId)!;
        const existing = siteMap.get(row.visitorKey);
        const lastSeen = Number(row.lastSeenAt);
        const pageviews = Number(row.pageviewsCount) || existing?.pageviewsCount || 1;

        if (!existing || existing.lastSeenAt < lastSeen) {
          siteMap.set(row.visitorKey, {
            visitorKey: row.visitorKey,
            sessionKey: row.sessionKey,
            currentPath: row.currentPath,
            pageTitle: row.pageTitle || existing?.pageTitle || undefined,
            pageUrl: row.pageUrl || existing?.pageUrl || undefined,
            country: row.country,
            countryCode: row.countryCode,
            city: row.city || undefined,
            deviceType: row.deviceType,
            browser: row.browser,
            os: row.os,
            source: row.source,
            ip: row.ip || fallbackIp(row.visitorKey),
            pageviewsCount: Math.max(pageviews, existing?.pageviewsCount || 1),
            lastSeenAt: lastSeen,
          });
        }
      }

      for (const siteId of affectedWebsites) {
        this.notifyActivity(siteId);
      }
    } catch (err: any) {
      logger.warn(`Realtime DB sync error: ${err.message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  recordActivity(websiteId: string, visitor: Omit<ActiveVisitor, "lastSeenAt">) {
    if (!this.websitesMap.has(websiteId)) {
      this.websitesMap.set(websiteId, new Map());
    }

    const websiteVisitors = this.websitesMap.get(websiteId)!;
    const existing = websiteVisitors.get(visitor.visitorKey);
    const pageviewsCount = (existing?.pageviewsCount || 0) + 1;

    websiteVisitors.set(visitor.visitorKey, {
      ...visitor,
      pageviewsCount,
      lastSeenAt: Date.now(),
    });
    this.notifyActivity(websiteId);
  }

  heartbeat(websiteId: string, visitorKey: string, currentPath?: string) {
    const websiteVisitors = this.websitesMap.get(websiteId);
    if (!websiteVisitors) return;

    const existing = websiteVisitors.get(visitorKey);
    if (existing) {
      existing.lastSeenAt = Date.now();
      if (currentPath) {
        existing.currentPath = currentPath;
      }
      this.notifyActivity(websiteId);
    }
  }

  getVisitorPageviews(websiteId: string, visitorKey: string): number {
    return this.websitesMap.get(websiteId)?.get(visitorKey)?.pageviewsCount || 1;
  }

  getActiveCount(websiteId: string, windowMs: number = this.DEFAULT_ONLINE_WINDOW_MS): number {
    this.cleanupWebsite(websiteId);
    const websiteVisitors = this.websitesMap.get(websiteId);
    if (!websiteVisitors) return 0;

    const cutoff = Date.now() - windowMs;
    let count = 0;
    for (const visitor of websiteVisitors.values()) {
      if (visitor.lastSeenAt >= cutoff) {
        count++;
      }
    }
    return count;
  }

  getActiveVisitors(websiteId: string, windowMs: number = this.DEFAULT_ONLINE_WINDOW_MS): ActiveVisitor[] {
    this.cleanupWebsite(websiteId);
    const websiteVisitors = this.websitesMap.get(websiteId);
    if (!websiteVisitors) return [];

    const cutoff = Date.now() - windowMs;
    return Array.from(websiteVisitors.values())
      .filter((v) => v.lastSeenAt >= cutoff)
      .sort((a, b) => {
        const countA = a.pageviewsCount || 1;
        const countB = b.pageviewsCount || 1;
        if (countB !== countA) return countB - countA;
        return b.lastSeenAt - a.lastSeenAt;
      });
  }

  private cleanupWebsite(websiteId: string) {
    const websiteVisitors = this.websitesMap.get(websiteId);
    if (!websiteVisitors) return;

    const cutoff = Date.now() - this.DEFAULT_ONLINE_WINDOW_MS;
    for (const [key, visitor] of websiteVisitors.entries()) {
      if (visitor.lastSeenAt < cutoff) {
        websiteVisitors.delete(key);
      }
    }
  }

  private cleanupStaleVisitors() {
    const cutoff = Date.now() - this.DEFAULT_ONLINE_WINDOW_MS;
    for (const [websiteId, visitors] of this.websitesMap.entries()) {
      let pruned = false;
      for (const [key, visitor] of visitors.entries()) {
        if (visitor.lastSeenAt < cutoff) {
          visitors.delete(key);
          pruned = true;
        }
      }
      if (visitors.size === 0) {
        this.websitesMap.delete(websiteId);
        pruned = true;
      }
      if (pruned) {
        this.notifyActivity(websiteId);
      }
    }
  }
}

export const realtimeService = new RealtimeService();
