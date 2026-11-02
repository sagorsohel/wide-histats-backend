import { eq, and, gte, lte, sql, desc, count } from "drizzle-orm";
import { db } from "../../db/index.js";
import { websites } from "../../db/schema/websites.js";
import { visitors } from "../../db/schema/visitors.js";
import { sessions } from "../../db/schema/sessions.js";
import { pageviews } from "../../db/schema/pageviews.js";
import { visitorLocations } from "../../db/schema/visitor-locations.js";
import { AnalyticsFilterInput } from "./analytics.schema.js";
import { realtimeService } from "../../services/realtime.service.js";

export class AnalyticsService {
  static async verifyAccess(websiteId: string, userId?: string) {
    const [website] = await db
      .select()
      .from(websites)
      .where(eq(websites.id, websiteId))
      .limit(1);

    if (!website) {
      throw new Error("Website not found.");
    }

    if (!website.isPublic && (!userId || website.userId !== userId)) {
      throw new Error("Access denied to this website analytics.");
    }

    return website;
  }

  static async getOverview(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const dateFilter = and(
      eq(pageviews.websiteId, filter.websiteId),
      gte(pageviews.viewedAt, filter.from),
      lte(pageviews.viewedAt, filter.to)
    );

    // 1. Total pageviews
    const [pvResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pageviews)
      .where(dateFilter);

    // 2. Unique visitors
    const [uvResult] = await db
      .select({ count: sql<number>`count(distinct ${pageviews.visitorId})::int` })
      .from(pageviews)
      .where(dateFilter);

    // 3. Sessions
    const sessionDateFilter = and(
      eq(sessions.websiteId, filter.websiteId),
      gte(sessions.startedAt, filter.from),
      lte(sessions.startedAt, filter.to)
    );

    const [sessResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessions)
      .where(sessionDateFilter);

    const totalPageviews = pvResult?.count || 0;
    const uniqueVisitors = uvResult?.count || 0;
    const totalSessions = sessResult?.count || 0;

    // 4. Calculate Bounce Rate & Avg Duration
    const bounceCountResult = await db.execute(sql`
      SELECT count(*)::int as single_page_sessions
      FROM (
        SELECT session_id
        FROM page_views
        WHERE website_id = ${filter.websiteId}
          AND viewed_at >= ${filter.from}
          AND viewed_at <= ${filter.to}
        GROUP BY session_id
        HAVING count(*) = 1
      ) s
    `);
    const singlePageSessions = Number(
      bounceCountResult.rows[0]?.single_page_sessions || 0
    );
    const bounceRate =
      totalSessions > 0
        ? Math.round((singlePageSessions / totalSessions) * 100)
        : 0;

    // Avg duration in seconds
    const durationResult = await db.execute(sql`
      SELECT coalesce(avg(extract(epoch from (last_seen_at - started_at))), 0)::int as avg_duration
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
    `);
    const avgDuration = Number(durationResult.rows[0]?.avg_duration || 0);

    let activeVisitors = realtimeService.getActiveCount(filter.websiteId);
    if (activeVisitors === 0) {
      await realtimeService.syncFromDatabase(filter.websiteId);
      activeVisitors = realtimeService.getActiveCount(filter.websiteId);
    }

    return {
      activeVisitors,
      totalPageviews,
      uniqueVisitors,
      totalSessions,
      pagesPerSession:
        totalSessions > 0
          ? Number((totalPageviews / totalSessions).toFixed(2))
          : 0,
      bounceRate,
      avgDuration,
      from: filter.from,
      to: filter.to,
    };
  }

  static async getRealtime(userId: string | undefined, websiteId: string) {
    await this.verifyAccess(websiteId, userId);

    let activeCount = realtimeService.getActiveCount(websiteId);
    if (activeCount === 0) {
      await realtimeService.syncFromDatabase(websiteId);
      activeCount = realtimeService.getActiveCount(websiteId);
    }
    const visitorsList = realtimeService.getActiveVisitors(websiteId);

    // In-memory active page and visitor counts
    const activePageCounts: Record<string, number> = {};
    const countriesMap: Record<string, { country: string; code: string; count: number }> = {};
    const devicesMap: Record<string, number> = {};
    const sourcesMap: Record<string, number> = {};

    visitorsList.forEach((v) => {
      activePageCounts[v.currentPath] = (activePageCounts[v.currentPath] || 0) + 1;
      devicesMap[v.deviceType] = (devicesMap[v.deviceType] || 0) + 1;
      sourcesMap[v.source] = (sourcesMap[v.source] || 0) + 1;

      if (!countriesMap[v.countryCode]) {
        countriesMap[v.countryCode] = {
          country: v.country,
          code: v.countryCode,
          count: 0,
        };
      }
      countriesMap[v.countryCode].count += 1;
    });

    const topCountries = Object.values(countriesMap).sort(
      (a, b) => b.count - a.count
    );

    // Query top pages with Title and full URL (REAL-TIME ACTIVE VISITORS ONLINE RIGHT NOW)
    const topPagesResult = await db.execute(sql`
      SELECT 
        coalesce(s.exit_page, s.landing_page, '/') as path,
        coalesce(nullif(max(pv.page_title), ''), max(s.exit_page), '/') as title,
        coalesce(max(pv.page_url), '') as url,
        count(distinct s.visitor_id)::int as count
      FROM sessions s
      LEFT JOIN page_views pv ON pv.session_id = s.id 
        AND pv.page_path = coalesce(s.exit_page, s.landing_page, '/')
      WHERE s.website_id = ${websiteId}
        AND s.last_seen_at >= now() - interval '12 minutes'
      GROUP BY coalesce(s.exit_page, s.landing_page, '/')
      ORDER BY count DESC
      LIMIT 15;
    `);

    const topPages = (topPagesResult.rows.length > 0
      ? topPagesResult.rows.map((r: any) => ({
          path: r.path as string,
          title: (r.title || r.path) as string,
          url: (r.url || "") as string,
          count: Number(r.count),
        }))
      : Object.entries(activePageCounts).map(([path, count]) => {
          const match = visitorsList.find((v) => v.currentPath === path);
          return {
            path,
            title: match?.pageTitle || path,
            url: match?.pageUrl || "",
            count,
          };
        })
    ).sort((a, b) => b.count - a.count);

    // Browsing pages count: total distinct pages currently being visited right now
    const browsingPagesResult = await db.execute(sql`
      SELECT count(distinct coalesce(s.exit_page, s.landing_page, '/'))::int as "browsingPagesCount"
      FROM sessions s
      WHERE s.website_id = ${websiteId}
        AND s.last_seen_at >= now() - interval '12 minutes';
    `);
    const browsingPagesCount = Number(browsingPagesResult.rows[0]?.browsingPagesCount || topPages.length);

    // Recent 30 pageviews with visitor location, device info & full URL
    const recentResult = await db.execute(sql`
      SELECT 
        pv.id,
        pv.page_path as path,
        pv.page_title as title,
        pv.page_url as url,
        pv.referrer,
        pv.viewed_at as "viewedAt",
        coalesce(vl.country, 'Unknown') as country,
        coalesce(vl.country_code, 'UNKNOWN') as "countryCode",
        coalesce(vl.city, '') as city,
        coalesce(s.browser, 'Chrome') as browser,
        coalesce(s.os, 'Windows') as os,
        coalesce(s.device_type, 'desktop') as "deviceType",
        v.visitor_key as "visitorKey",
        coalesce(nullif(trim(s.ip_address), ''), '127.0.0.1') as ip
      FROM page_views pv
      LEFT JOIN visitors v ON pv.visitor_id = v.id
      LEFT JOIN visitor_locations vl ON pv.visitor_id = vl.visitor_id
      LEFT JOIN sessions s ON pv.session_id = s.id
      WHERE pv.website_id = ${websiteId}
      ORDER BY pv.viewed_at DESC
      LIMIT 30
    `);

    // Top Referrers of Active Visitors Online Right Now (12-minute window)
    const topReferrersResult = await db.execute(sql`
      SELECT 
        coalesce(nullif(trim(s.referrer), ''), s.source, 'direct') as referrer,
        count(distinct s.visitor_id)::int as count
      FROM sessions s
      WHERE s.website_id = ${websiteId}
        AND s.last_seen_at >= now() - interval '12 minutes'
      GROUP BY coalesce(nullif(trim(s.referrer), ''), s.source, 'direct')
      ORDER BY count DESC
      LIMIT 10;
    `);

    const topReferrers = topReferrersResult.rows.map((r: any) => ({
      referrer: r.referrer as string,
      count: Number(r.count),
    }));

    // Query Today totals and All-time totals
    const todayResult = await db.execute(sql`
      SELECT 
        count(distinct visitor_id)::int as "todayVisitors",
        count(*)::int as "todayPageviews"
      FROM page_views
      WHERE website_id = ${websiteId}
        AND viewed_at >= date_trunc('day', now())
    `);

    const totalResult = await db.execute(sql`
      SELECT 
        count(distinct visitor_id)::int as "totalVisitors",
        count(*)::int as "totalPageviews"
      FROM page_views
      WHERE website_id = ${websiteId}
    `);

    const activeCount5m = realtimeService.getActiveCount(websiteId, 5 * 60 * 1000);
    const activeCount15m = realtimeService.getActiveCount(websiteId, 15 * 60 * 1000);

    return {
      activeCount,
      activeCount5m,
      activeCount15m,
      browsingPagesCount,
      todayVisitors: Number((todayResult.rows[0] as any)?.todayVisitors || 0),
      todayPageviews: Number((todayResult.rows[0] as any)?.todayPageviews || 0),
      totalVisitors: Number((totalResult.rows[0] as any)?.totalVisitors || 0),
      totalPageviews: Number((totalResult.rows[0] as any)?.totalPageviews || 0),
      activeVisitors: visitorsList,
      topPages,
      topCountries,
      topReferrers,
      devices: devicesMap,
      sources: sourcesMap,
      recentPageviews: recentResult.rows,
    };
  }

  static async getTimeseries(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const result = await db.execute(sql`
      SELECT 
        to_char(viewed_at, 'YYYY-MM-DD') as date,
        count(*)::int as pageviews,
        count(distinct visitor_id)::int as visitors,
        count(distinct session_id)::int as sessions
      FROM page_views
      WHERE website_id = ${filter.websiteId}
        AND viewed_at >= ${filter.from}
        AND viewed_at <= ${filter.to}
      GROUP BY to_char(viewed_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    return result.rows;
  }

  static async getGeography(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const countries = await db.execute(sql`
      SELECT 
        coalesce(vl.country, 'Unknown') as country,
        coalesce(vl.country_code, 'UNKNOWN') as country_code,
        count(distinct pv.visitor_id)::int as visitors,
        count(pv.id)::int as pageviews
      FROM page_views pv
      LEFT JOIN visitor_locations vl ON pv.visitor_id = vl.visitor_id
      WHERE pv.website_id = ${filter.websiteId}
        AND pv.viewed_at >= ${filter.from}
        AND pv.viewed_at <= ${filter.to}
      GROUP BY vl.country, vl.country_code
      ORDER BY visitors DESC
      LIMIT ${filter.limit}
    `);

    const cities = await db.execute(sql`
      SELECT 
        coalesce(vl.city, 'Unknown') as city,
        coalesce(vl.country, 'Unknown') as country,
        count(distinct pv.visitor_id)::int as visitors
      FROM page_views pv
      LEFT JOIN visitor_locations vl ON pv.visitor_id = vl.visitor_id
      WHERE pv.website_id = ${filter.websiteId}
        AND pv.viewed_at >= ${filter.from}
        AND pv.viewed_at <= ${filter.to}
        AND vl.city IS NOT NULL AND vl.city != ''
      GROUP BY vl.city, vl.country
      ORDER BY visitors DESC
      LIMIT ${filter.limit}
    `);

    return {
      countries: countries.rows,
      cities: cities.rows,
    };
  }

  static async getSources(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const sources = await db.execute(sql`
      SELECT 
        source,
        medium,
        count(*)::int as sessions,
        count(distinct visitor_id)::int as visitors
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
      GROUP BY source, medium
      ORDER BY sessions DESC
      LIMIT ${filter.limit}
    `);

    const referrers = await db.execute(sql`
      SELECT 
        coalesce(referrer, 'Direct / None') as referrer,
        count(*)::int as count
      FROM page_views
      WHERE website_id = ${filter.websiteId}
        AND viewed_at >= ${filter.from}
        AND viewed_at <= ${filter.to}
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT ${filter.limit}
    `);

    const campaigns = await db.execute(sql`
      SELECT 
        campaign,
        count(*)::int as sessions
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
        AND campaign IS NOT NULL AND campaign != ''
      GROUP BY campaign
      ORDER BY sessions DESC
      LIMIT ${filter.limit}
    `);

    return {
      sources: sources.rows,
      referrers: referrers.rows,
      campaigns: campaigns.rows,
    };
  }

  static async getPages(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const pages = await db.execute(sql`
      SELECT 
        page_path as path,
        max(page_title) as title,
        count(*)::int as pageviews,
        count(distinct visitor_id)::int as visitors
      FROM page_views
      WHERE website_id = ${filter.websiteId}
        AND viewed_at >= ${filter.from}
        AND viewed_at <= ${filter.to}
      GROUP BY page_path
      ORDER BY pageviews DESC
      LIMIT ${filter.limit}
    `);

    return pages.rows;
  }

  static async getLandingPages(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const landing = await db.execute(sql`
      SELECT 
        landing_page as path,
        count(*)::int as sessions
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
        AND landing_page IS NOT NULL
      GROUP BY landing_page
      ORDER BY sessions DESC
      LIMIT ${filter.limit}
    `);

    return landing.rows;
  }

  static async getExitPages(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const exit = await db.execute(sql`
      SELECT 
        exit_page as path,
        count(*)::int as sessions
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
        AND exit_page IS NOT NULL
      GROUP BY exit_page
      ORDER BY sessions DESC
      LIMIT ${filter.limit}
    `);

    return exit.rows;
  }

  static async getDevices(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const devices = await db.execute(sql`
      SELECT 
        coalesce(device_type, 'desktop') as device,
        count(*)::int as sessions,
        count(distinct visitor_id)::int as visitors
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
      GROUP BY device_type
      ORDER BY sessions DESC
    `);

    return devices.rows;
  }

  static async getBrowsers(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const browsers = await db.execute(sql`
      SELECT 
        coalesce(browser, 'Unknown') as browser,
        count(*)::int as sessions,
        count(distinct visitor_id)::int as visitors
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
      GROUP BY browser
      ORDER BY sessions DESC
      LIMIT ${filter.limit}
    `);

    return browsers.rows;
  }

  static async getOperatingSystems(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const os = await db.execute(sql`
      SELECT 
        coalesce(os, 'Unknown') as os,
        count(*)::int as sessions,
        count(distinct visitor_id)::int as visitors
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${filter.from}
        AND started_at <= ${filter.to}
      GROUP BY os
      ORDER BY sessions DESC
      LIMIT ${filter.limit}
    `);

    return os.rows;
  }
}
