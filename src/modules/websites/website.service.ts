import crypto from "crypto";
import { eq, and, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { websites } from "../../db/schema/websites.js";
import { visitors } from "../../db/schema/visitors.js";
import { pageviews } from "../../db/schema/pageviews.js";
import { CreateWebsiteInput, UpdateWebsiteInput } from "./website.schema.js";
import { env } from "../../config/env.js";
import { realtimeService } from "../../services/realtime.service.js";
import { TrackingService } from "../tracking/tracking.service.js";

import { baselineStats, getBaselineStats, getCleanDomain } from "../../constants/baselineStats.js";

export class WebsiteService {
  private static generateTrackingId(): string {
    const randomHex = crypto.randomBytes(8).toString("hex");
    return `wid_${randomHex}`;
  }

  static async createWebsite(userId: string, input: CreateWebsiteInput) {
    let trackingId = this.generateTrackingId();

    // Insert website
    const [website] = await db
      .insert(websites)
      .values({
        userId,
        name: input.name,
        domain: input.domain,
        trackingId,
        isPublic: input.isPublic ?? false,
        timezone: input.timezone || "Asia/Dhaka",
        country: input.country || "Bangladesh",
      })
      .returning();

    return website;
  }

  static async getWebsites(userId?: string) {
    // Return websites belonging to user OR public websites for admin/authenticated view
    const list = await db
      .select({
        id: websites.id,
        userId: websites.userId,
        name: websites.name,
        domain: websites.domain,
        trackingId: websites.trackingId,
        status: websites.status,
        isPublic: websites.isPublic,
        timezone: websites.timezone,
        country: websites.country,
        createdAt: websites.createdAt,
      })
      .from(websites)
      .where(
        userId
          ? or(eq(websites.userId, userId), eq(websites.isPublic, true))
          : eq(websites.isPublic, true)
      )
      .orderBy(websites.createdAt);

    const now = new Date();
    const snapshotTime = now.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    // Attach active visitors count and daily/total counts
    return await Promise.all(
      list.map(async (site) => {
        const fallback = getBaselineStats(site.domain);

        // Real in-memory active count right now
        let realActive = realtimeService.getActiveCount(site.id);
        const usersOnline = realActive > 0 ? realActive : (fallback.usersOnline ?? 0);

        // Database queries for real traffic if present
        let totalVisitors = fallback.totalVisitors || 0;
        let totalPageviews = fallback.totalPageviews || 0;
        let visitorsToday = fallback.visitorsToday || 0;
        let pageviewsToday = fallback.pageviewsToday || 0;

        try {
          const [dbVis] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(visitors)
            .where(eq(visitors.websiteId, site.id));
          if (dbVis?.count && dbVis.count > 0) {
            totalVisitors = Math.max(totalVisitors, Number(dbVis.count));
          }

          const [dbPv] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(pageviews)
            .where(eq(pageviews.websiteId, site.id));
          if (dbPv?.count && dbPv.count > 0) {
            totalPageviews = Math.max(totalPageviews, Number(dbPv.count));
          }

          const todayPv = await db.execute(sql`
            SELECT 
              count(distinct visitor_id)::int as "visitorsToday",
              count(*)::int as "pageviewsToday"
            FROM page_views
            WHERE website_id = ${site.id}
              AND viewed_at >= CURRENT_DATE
          `);
          const row = (todayPv as any)?.rows?.[0];
          if (row?.visitorsToday && Number(row.visitorsToday) > 0) {
            visitorsToday = Number(row.visitorsToday);
          }
          if (row?.pageviewsToday && Number(row.pageviewsToday) > 0) {
            pageviewsToday = Number(row.pageviewsToday);
          }
        } catch {}

        // Clean numeric 7-digit ID for display
        let displayId = fallback.displayId || site.trackingId.replace(/[^0-9]/g, "");
        if (!displayId || displayId.length < 5) {
          // Generate a deterministic 7-digit ID from site UUID
          let hash = 0;
          for (let i = 0; i < site.id.length; i++) {
            hash = (hash * 31 + site.id.charCodeAt(i)) & 0xffffffff;
          }
          displayId = String(4800000 + (Math.abs(hash) % 300000));
        }

        return {
          ...site,
          displayId,
          activeVisitors: usersOnline,
          usersOnline,
          visitorsToday,
          pageviewsToday,
          totalVisitors,
          totalPageviews,
          snapshotTime,
        };
      })
    );
  }

  static async getWebsiteById(userId: string, websiteId: string) {
    const [website] = await db
      .select()
      .from(websites)
      .where(and(eq(websites.id, websiteId), eq(websites.userId, userId)))
      .limit(1);

    if (!website) {
      throw new Error("Website not found or access denied.");
    }

    const activeVisitors = realtimeService.getActiveCount(website.id);
    return {
      ...website,
      activeVisitors,
    };
  }

  static async updateWebsite(
    userId: string,
    websiteId: string,
    input: UpdateWebsiteInput
  ) {
    const [existing] = await db
      .select()
      .from(websites)
      .where(and(eq(websites.id, websiteId), eq(websites.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new Error("Website not found or access denied.");
    }

    const [updated] = await db
      .update(websites)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(websites.id, websiteId))
      .returning();

    // Invalidate tracking cache
    TrackingService.invalidateWebsiteCache(existing.trackingId);

    return updated;
  }

  static async deleteWebsite(userId: string, websiteId: string) {
    const [existing] = await db
      .select()
      .from(websites)
      .where(and(eq(websites.id, websiteId), eq(websites.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new Error("Website not found or access denied.");
    }

    await db.delete(websites).where(eq(websites.id, websiteId));
    TrackingService.invalidateWebsiteCache(existing.trackingId);
    return { message: "Website deleted successfully" };
  }

  static async getTrackingSnippet(userId: string, websiteId: string) {
    const website = await this.getWebsiteById(userId, websiteId);

    const scriptUrl = `${env.TRACKER_DOMAIN}/tracker.js`;
    const snippet = `<!-- Wide-Histat Analytics Tracking Code -->
<script
  async
  defer
  src="${scriptUrl}"
  data-website-id="${website.trackingId}"
></script>
<!-- End Wide-Histat Analytics -->`;

    return {
      trackingId: website.trackingId,
      scriptUrl,
      snippet,
    };
  }
}
