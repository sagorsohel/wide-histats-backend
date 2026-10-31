import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { websites } from "../../db/schema/websites.js";
import { visitors } from "../../db/schema/visitors.js";
import { pageviews } from "../../db/schema/pageviews.js";
import { CreateWebsiteInput, UpdateWebsiteInput } from "./website.schema.js";
import { env } from "../../config/env.js";
import { realtimeService } from "../../services/realtime.service.js";
import { TrackingService } from "../tracking/tracking.service.js";

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
      })
      .returning();

    return website;
  }

  static async getWebsites(userId: string) {
    const list = await db
      .select({
        id: websites.id,
        name: websites.name,
        domain: websites.domain,
        trackingId: websites.trackingId,
        status: websites.status,
        isPublic: websites.isPublic,
        createdAt: websites.createdAt,
      })
      .from(websites)
      .where(eq(websites.userId, userId))
      .orderBy(websites.createdAt);

    // Attach active visitors count and total counts
    return await Promise.all(
      list.map(async (site) => {
        const activeVisitors = realtimeService.getActiveCount(site.id);

        const [visitorCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(visitors)
          .where(eq(visitors.websiteId, site.id));

        const [pageviewCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(pageviews)
          .where(eq(pageviews.websiteId, site.id));

        return {
          ...site,
          activeVisitors,
          totalVisitors: visitorCount?.count || 0,
          totalPageviews: pageviewCount?.count || 0,
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
