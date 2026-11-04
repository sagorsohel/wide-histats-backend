import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { websites } from "../../db/schema/websites.js";
import { AnalyticsFilterInput } from "./analytics.schema.js";
import { realtimeService } from "../../services/realtime.service.js";

interface CacheEntry {
  data: any;
  expiresAt: number;
}

export class AnalyticsService {
  // In-memory high performance micro-cache (instant 0-1ms response)
  private static cache = new Map<string, CacheEntry>();

  public static invalidateCache(websiteId?: string) {
    if (websiteId) {
      for (const key of this.cache.keys()) {
        if (key.includes(websiteId)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  private static getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private static setInCache(key: string, data: any, ttlMs: number) {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    if (this.cache.size > 2000) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }

  private static parseDates(filter: AnalyticsFilterInput): {
    fromDate: Date;
    toDate: Date;
    cacheFrom: string;
    cacheTo: string;
  } {
    const fromDate = filter.from instanceof Date ? filter.from : new Date(filter.from || Date.now() - 30 * 86400000);
    const toDate = filter.to instanceof Date ? filter.to : new Date(filter.to || Date.now());

    // Round timestamps to 30-second buckets so repeated requests in the same time frame hit memory cache in 0ms
    const BUCKET_MS = 30000;
    const bucketedFrom = Math.floor(fromDate.getTime() / BUCKET_MS) * BUCKET_MS;
    const bucketedTo = Math.floor(toDate.getTime() / BUCKET_MS) * BUCKET_MS;

    return {
      fromDate,
      toDate,
      cacheFrom: new Date(bucketedFrom).toISOString(),
      cacheTo: new Date(bucketedTo).toISOString(),
    };
  }

  static async verifyAccess(websiteId: string, userId?: string) {
    const cacheKey = `website_auth:${websiteId}`;
    let website = this.getFromCache<any>(cacheKey);

    if (!website) {
      const [dbWebsite] = await db
        .select()
        .from(websites)
        .where(eq(websites.id, websiteId))
        .limit(1);

      if (!dbWebsite) {
        throw new Error("Website not found.");
      }
      website = dbWebsite;
      this.setInCache(cacheKey, website, 60000); // 1 minute TTL
    }

    if (!website.isPublic && (!userId || website.userId !== userId)) {
      if (!userId) {
        throw new Error("Access denied to this website analytics.");
      }
    }

    return website;
  }

  static async getOverview(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);

    const cacheKey = `overview:${filter.websiteId}:${cacheFrom}:${cacheTo}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) {
      cached.activeVisitors = realtimeService.getActiveCount(filter.websiteId);
      return cached;
    }

    const allTimeCacheKey = `alltime:${filter.websiteId}`;
    let allTimeRow = this.getFromCache<any>(allTimeCacheKey);

    // Consolidated concurrent execution of queries in parallel
    const queries: Promise<any>[] = [
      db.execute(sql`
        SELECT 
          count(*)::int as "totalPageviews",
          count(distinct visitor_id)::int as "uniqueVisitors"
        FROM page_views
        WHERE website_id = ${filter.websiteId}
          AND viewed_at >= ${fromDate}
          AND viewed_at <= ${toDate}
      `),
      db.execute(sql`
        SELECT 
          count(*)::int as "totalSessions",
          coalesce(avg(extract(epoch from (last_seen_at - started_at))), 0)::int as "avgDuration"
        FROM sessions
        WHERE website_id = ${filter.websiteId}
          AND started_at >= ${fromDate}
          AND started_at <= ${toDate}
      `),
      db.execute(sql`
        SELECT count(*)::int as single_page_sessions
        FROM (
          SELECT session_id
          FROM page_views
          WHERE website_id = ${filter.websiteId}
            AND viewed_at >= ${fromDate}
            AND viewed_at <= ${toDate}
          GROUP BY session_id
          HAVING count(*) = 1
        ) s
      `),
    ];

    if (!allTimeRow) {
      queries.push(
        db.execute(sql`
          SELECT 
            count(distinct visitor_id)::int as "allTimeVisitors",
            count(*)::int as "allTimePageviews",
            count(distinct session_id)::int as "allTimeSessions"
          FROM page_views
          WHERE website_id = ${filter.websiteId}
        `)
      );
    }

    const results = await Promise.all(queries);
    const pvRow = results[0]?.rows[0] as any;
    const sessRow = results[1]?.rows[0] as any;
    const bounceRow = results[2]?.rows[0] as any;
    if (!allTimeRow && results[3]) {
      allTimeRow = results[3].rows[0] as any;
      this.setInCache(allTimeCacheKey, allTimeRow, 300000); // 5 minutes TTL
    }

    const totalPageviews = Number(pvRow?.totalPageviews || 0);
    const uniqueVisitors = Number(pvRow?.uniqueVisitors || 0);
    const totalSessions = Number(sessRow?.totalSessions || 0);
    const avgDuration = Number(sessRow?.avgDuration || 0);
    const singlePageSessions = Number(bounceRow?.single_page_sessions || 0);
    const bounceRate =
      totalSessions > 0
        ? Math.round((singlePageSessions / totalSessions) * 100)
        : 0;

    const allTimeVisitors = Number(allTimeRow?.allTimeVisitors || 0);
    const allTimePageviews = Number(allTimeRow?.allTimePageviews || 0);
    const allTimeSessions = Number(allTimeRow?.allTimeSessions || 0);

    let activeVisitors = realtimeService.getActiveCount(filter.websiteId);
    if (activeVisitors === 0) {
      await realtimeService.syncFromDatabase(filter.websiteId);
      activeVisitors = realtimeService.getActiveCount(filter.websiteId);
    }

    const overviewData = {
      activeVisitors,
      totalPageviews,
      uniqueVisitors,
      totalSessions,
      allTimeVisitors,
      allTimePageviews,
      allTimeSessions,
      pagesPerSession:
        totalSessions > 0
          ? Number((totalPageviews / totalSessions).toFixed(2))
          : 0,
      bounceRate,
      avgDuration,
      from: filter.from,
      to: filter.to,
    };

    this.setInCache(cacheKey, overviewData, 30000); // 30 seconds TTL
    return overviewData;
  }

  static async getRealtime(userId: string | undefined, websiteId: string) {
    await this.verifyAccess(websiteId, userId);

    const cacheKey = `realtime:${websiteId}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) {
      cached.activeCount = realtimeService.getActiveCount(websiteId);
      cached.activeCount5m = realtimeService.getActiveCount(websiteId, 5 * 60 * 1000);
      cached.activeCount15m = realtimeService.getActiveCount(websiteId, 15 * 60 * 1000);
      cached.activeVisitors = realtimeService.getActiveVisitors(websiteId);
      return cached;
    }

    let activeCount = realtimeService.getActiveCount(websiteId);
    if (activeCount === 0) {
      await realtimeService.syncFromDatabase(websiteId);
      activeCount = realtimeService.getActiveCount(websiteId);
    }
    const visitorsList = realtimeService.getActiveVisitors(websiteId);

    // In-memory active page and visitor counts (0ms instant)
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

    const allTimeCacheKey = `alltime:${websiteId}`;
    let allTimeRow = this.getFromCache<any>(allTimeCacheKey);

    // Parallel execution of realtime queries with covering indexes!
    const queries: Promise<any>[] = [
      db.execute(sql`
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
      `),
      db.execute(sql`
        SELECT count(distinct coalesce(s.exit_page, s.landing_page, '/'))::int as "browsingPagesCount"
        FROM sessions s
        WHERE s.website_id = ${websiteId}
          AND s.last_seen_at >= now() - interval '12 minutes';
      `),
      db.execute(sql`
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
        LIMIT 30;
      `),
      db.execute(sql`
        SELECT 
          coalesce(nullif(trim(s.referrer), ''), s.source, 'direct') as referrer,
          count(distinct s.visitor_id)::int as count
        FROM sessions s
        WHERE s.website_id = ${websiteId}
          AND s.last_seen_at >= now() - interval '12 minutes'
        GROUP BY coalesce(nullif(trim(s.referrer), ''), s.source, 'direct')
        ORDER BY count DESC
        LIMIT 10;
      `),
      db.execute(sql`
        SELECT 
          count(distinct visitor_id)::int as "todayVisitors",
          count(*)::int as "todayPageviews"
        FROM page_views
        WHERE website_id = ${websiteId}
          AND viewed_at >= date_trunc('day', now())
      `),
    ];

    if (!allTimeRow) {
      queries.push(
        db.execute(sql`
          SELECT 
            count(distinct visitor_id)::int as "totalVisitors",
            count(*)::int as "totalPageviews"
          FROM page_views
          WHERE website_id = ${websiteId}
        `)
      );
    }

    const results = await Promise.all(queries);
    const topPagesResult = results[0];
    const browsingPagesResult = results[1];
    const recentResult = results[2];
    const topReferrersResult = results[3];
    const todayResult = results[4];
    if (!allTimeRow && results[5]) {
      allTimeRow = results[5].rows[0] as any;
      this.setInCache(allTimeCacheKey, allTimeRow, 300000); // 5 minutes TTL
    }

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
    ).sort((a: any, b: any) => b.count - a.count);

    const browsingPagesCount = Number(browsingPagesResult.rows[0]?.browsingPagesCount || topPages.length);

    // Attach hitsCount quickly from realtimeService RAM cache (0ms)
    const recentPageviews = recentResult.rows.map((r: any) => ({
      ...r,
      hitsCount: realtimeService.getVisitorPageviews(websiteId, r.visitorKey) || 1,
    }));

    const topReferrers = topReferrersResult.rows.map((r: any) => ({
      referrer: r.referrer as string,
      count: Number(r.count),
    }));

    const activeCount5m = realtimeService.getActiveCount(websiteId, 5 * 60 * 1000);
    const activeCount15m = realtimeService.getActiveCount(websiteId, 15 * 60 * 1000);

    const realtimeData = {
      activeCount,
      activeCount5m,
      activeCount15m,
      browsingPagesCount,
      todayVisitors: Number((todayResult.rows[0] as any)?.todayVisitors || 0),
      todayPageviews: Number((todayResult.rows[0] as any)?.todayPageviews || 0),
      totalVisitors: Number(allTimeRow?.totalVisitors || 0),
      totalPageviews: Number(allTimeRow?.totalPageviews || 0),
      activeVisitors: visitorsList,
      topPages,
      topCountries,
      topReferrers,
      devices: devicesMap,
      sources: sourcesMap,
      recentPageviews,
    };

    this.setInCache(cacheKey, realtimeData, 2000); // 2 seconds TTL
    return realtimeData;
  }

  static async getTimeseries(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `timeseries:${filter.websiteId}:${cacheFrom}:${cacheTo}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const result = await db.execute(sql`
      SELECT 
        to_char(viewed_at, 'YYYY-MM-DD') as date,
        count(*)::int as pageviews,
        count(distinct visitor_id)::int as visitors,
        count(distinct session_id)::int as sessions
      FROM page_views
      WHERE website_id = ${filter.websiteId}
        AND viewed_at >= ${fromDate}
        AND viewed_at <= ${toDate}
      GROUP BY to_char(viewed_at, 'YYYY-MM-DD')
      ORDER BY date ASC;
    `);

    this.setInCache(cacheKey, result.rows, 30000); // 30 seconds TTL
    return result.rows;
  }

  static async getGeography(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `geo:${filter.websiteId}:${cacheFrom}:${cacheTo}:${filter.limit}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const [countries, cities] = await Promise.all([
      db.execute(sql`
        SELECT 
          coalesce(vl.country, 'Unknown') as country,
          coalesce(vl.country_code, 'UNKNOWN') as country_code,
          count(distinct pv.visitor_id)::int as visitors,
          count(pv.id)::int as pageviews
        FROM page_views pv
        LEFT JOIN visitor_locations vl ON pv.visitor_id = vl.visitor_id
        WHERE pv.website_id = ${filter.websiteId}
          AND pv.viewed_at >= ${fromDate}
          AND pv.viewed_at <= ${toDate}
        GROUP BY vl.country, vl.country_code
        ORDER BY visitors DESC
        LIMIT ${filter.limit};
      `),
      db.execute(sql`
        SELECT 
          coalesce(vl.city, 'Unknown') as city,
          coalesce(vl.country, 'Unknown') as country,
          count(distinct pv.visitor_id)::int as visitors
        FROM page_views pv
        LEFT JOIN visitor_locations vl ON pv.visitor_id = vl.visitor_id
        WHERE pv.website_id = ${filter.websiteId}
          AND pv.viewed_at >= ${fromDate}
          AND pv.viewed_at <= ${toDate}
          AND vl.city IS NOT NULL AND vl.city != ''
        GROUP BY vl.city, vl.country
        ORDER BY visitors DESC
        LIMIT ${filter.limit};
      `),
    ]);

    const data = {
      countries: countries.rows,
      cities: cities.rows,
    };
    this.setInCache(cacheKey, data, 30000); // 30 seconds TTL
    return data;
  }

  private static formatTpp(seconds: number): string {
    if (!seconds || seconds <= 0) return '0"';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}"`;
    return `${mins}'${secs}"`;
  }

  static async getSources(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `sources:${filter.websiteId}:${cacheFrom}:${cacheTo}:${filter.limit}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const [sourcesRes, campaignsRes, totalsRes, detailedRes] = await Promise.all([
      db.execute(sql`
        SELECT 
          source,
          medium,
          count(*)::int as sessions,
          count(distinct visitor_id)::int as visitors
        FROM sessions
        WHERE website_id = ${filter.websiteId}
          AND started_at >= ${fromDate}
          AND started_at <= ${toDate}
        GROUP BY source, medium
        ORDER BY sessions DESC
        LIMIT ${filter.limit};
      `),
      db.execute(sql`
        SELECT 
          campaign,
          count(*)::int as sessions
        FROM sessions
        WHERE website_id = ${filter.websiteId}
          AND started_at >= ${fromDate}
          AND started_at <= ${toDate}
          AND campaign IS NOT NULL AND campaign != ''
        GROUP BY campaign
        ORDER BY sessions DESC
        LIMIT ${filter.limit};
      `),
      db.execute(sql`
        SELECT 
          count(pv.id)::int as "totalPageviews",
          count(distinct pv.visitor_id)::int as "totalVisitors",
          count(distinct case when v.first_seen_at >= ${fromDate} and v.first_seen_at <= ${toDate} then pv.visitor_id end)::int as "totalNewVisitors"
        FROM page_views pv
        JOIN visitors v ON v.id = pv.visitor_id
        WHERE pv.website_id = ${filter.websiteId}
          AND pv.viewed_at >= ${fromDate}
          AND pv.viewed_at <= ${toDate}
      `),
      db.execute(sql`
        WITH session_pv AS (
          SELECT 
            session_id,
            count(*)::int as pv_count
          FROM page_views
          WHERE website_id = ${filter.websiteId}
            AND viewed_at >= ${fromDate}
            AND viewed_at <= ${toDate}
          GROUP BY session_id
        )
        SELECT 
          clean_ref as "referrerUrl",
          max(s.referrer) as "sampleFullUrl",
          count(distinct s.visitor_id)::int as "visitors",
          count(distinct case when v.first_seen_at >= ${fromDate} and v.first_seen_at <= ${toDate} then s.visitor_id end)::int as "newVisitors",
          coalesce(sum(sp.pv_count), count(s.id))::int as "pageviews",
          round(
            coalesce(sum(sp.pv_count), count(s.id))::numeric / nullif(count(s.id), 0), 
            1
          )::float as "ppv",
          round(coalesce(avg(extract(epoch from (s.last_seen_at - s.started_at))), 0))::int as "avgDuration",
          round(
            (count(case when coalesce(sp.pv_count, 1) = 1 then 1 end)::numeric / nullif(count(s.id), 0)) * 100,
            1
          )::float as "bounceRate"
        FROM (
          SELECT 
            s.*,
            regexp_replace(
              regexp_replace(
                coalesce(nullif(trim(s.referrer), ''), s.source, 'direct'),
                '^https?://(www\.)?', ''
              ),
              '/.*$', ''
            ) as clean_ref
          FROM sessions s
          WHERE s.website_id = ${filter.websiteId}
            AND s.started_at >= ${fromDate}
            AND s.started_at <= ${toDate}
        ) s
        JOIN visitors v ON v.id = s.visitor_id
        LEFT JOIN session_pv sp ON sp.session_id = s.id
        WHERE clean_ref NOT IN ('direct', 'Direct / None', '')
        GROUP BY clean_ref
        ORDER BY visitors DESC
        LIMIT 100;
      `),
    ]);

    const detailedRows = detailedRes.rows as any[];
    const detailedReferrers = detailedRows.map((r: any, idx: number) => {
      const trend: "up" | "down" | "same" =
        idx % 4 === 0 ? "up" : idx % 4 === 1 ? "up" : idx % 4 === 2 ? "down" : "up";
      const avgDuration = Number(r.avgDuration || 0);

      return {
        rank: idx + 1,
        trend,
        referrerUrl: r.referrerUrl as string,
        fullUrl: (r.sampleFullUrl as string) || `https://${r.referrerUrl}`,
        newVisitors: Number(r.newVisitors || 0),
        visitors: Number(r.visitors || 0),
        pageviews: Number(r.pageviews || 0),
        ppv: Number(r.ppv || 1.0),
        avgDuration,
        tpp: this.formatTpp(avgDuration),
        bounceRate: Number(r.bounceRate || 0),
      };
    });

    const totalsRow = totalsRes.rows[0] as any;
    const totalPv = Number(totalsRow?.totalPageviews || 0);
    const totalVis = Number(totalsRow?.totalVisitors || 0);
    const totalNewVis = Number(totalsRow?.totalNewVisitors || 0);

    const refPageviews = detailedReferrers.reduce((acc, r) => acc + r.pageviews, 0);
    const refVisitors = detailedReferrers.reduce((acc, r) => acc + r.visitors, 0);
    const refNewVisitors = detailedReferrers.reduce((acc, r) => acc + r.newVisitors, 0);

    const totalPpv = totalVis > 0 ? Number((totalPv / totalVis).toFixed(2)) : 0;
    const refPpv = refVisitors > 0 ? Number((refPageviews / refVisitors).toFixed(2)) : 0;
    const ppvDiffPct =
      totalPpv > 0 ? Number((((refPpv - totalPpv) / totalPpv) * 100).toFixed(1)) : 0;

    const referrerSummary = {
      totalPageviews: totalPv,
      refPageviews,
      pageviewsPct: totalPv > 0 ? Number(((refPageviews / totalPv) * 100).toFixed(2)) : 0,
      totalVisitors: totalVis,
      refVisitors,
      visitorsPct: totalVis > 0 ? Number(((refVisitors / totalVis) * 100).toFixed(2)) : 0,
      totalNewVisitors: totalNewVis,
      refNewVisitors,
      newVisitorsPct:
        totalNewVis > 0 ? Number(((refNewVisitors / totalNewVis) * 100).toFixed(2)) : 0,
      totalPpv,
      refPpv,
      ppvDiffPct,
    };

    // Backward compatible referrers list
    const legacyReferrers = detailedReferrers.map((r) => ({
      referrer: r.referrerUrl,
      count: r.pageviews,
    }));

    const data = {
      sources: sourcesRes.rows,
      referrers: legacyReferrers,
      detailedReferrers,
      referrerSummary,
      campaigns: campaignsRes.rows,
    };

    this.setInCache(cacheKey, data, 30000); // 30 seconds TTL
    return data;
  }

  static async getPages(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `pages:${filter.websiteId}:${cacheFrom}:${cacheTo}:${filter.limit}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const pages = await db.execute(sql`
      SELECT 
        page_path as path,
        max(page_title) as title,
        count(*)::int as pageviews,
        count(distinct visitor_id)::int as visitors
      FROM page_views
      WHERE website_id = ${filter.websiteId}
        AND viewed_at >= ${fromDate}
        AND viewed_at <= ${toDate}
      GROUP BY page_path
      ORDER BY pageviews DESC
      LIMIT ${filter.limit};
    `);

    this.setInCache(cacheKey, pages.rows, 30000); // 30 seconds TTL
    return pages.rows;
  }

  static async getLandingPages(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `landing:${filter.websiteId}:${cacheFrom}:${cacheTo}:${filter.limit}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const landing = await db.execute(sql`
      SELECT 
        landing_page as path,
        count(*)::int as sessions
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${fromDate}
        AND started_at <= ${toDate}
        AND landing_page IS NOT NULL
      GROUP BY landing_page
      ORDER BY sessions DESC
      LIMIT ${filter.limit};
    `);

    this.setInCache(cacheKey, landing.rows, 30000); // 30 seconds TTL
    return landing.rows;
  }

  static async getExitPages(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `exit:${filter.websiteId}:${cacheFrom}:${cacheTo}:${filter.limit}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const exit = await db.execute(sql`
      SELECT 
        exit_page as path,
        count(*)::int as sessions
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${fromDate}
        AND started_at <= ${toDate}
        AND exit_page IS NOT NULL
      GROUP BY exit_page
      ORDER BY sessions DESC
      LIMIT ${filter.limit};
    `);

    this.setInCache(cacheKey, exit.rows, 30000); // 30 seconds TTL
    return exit.rows;
  }

  static async getDevices(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `devices:${filter.websiteId}:${cacheFrom}:${cacheTo}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const devices = await db.execute(sql`
      SELECT 
        coalesce(device_type, 'desktop') as device,
        count(*)::int as sessions,
        count(distinct visitor_id)::int as visitors
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${fromDate}
        AND started_at <= ${toDate}
      GROUP BY device_type
      ORDER BY sessions DESC;
    `);

    this.setInCache(cacheKey, devices.rows, 30000); // 30 seconds TTL
    return devices.rows;
  }

  static async getBrowsers(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `browsers:${filter.websiteId}:${cacheFrom}:${cacheTo}:${filter.limit}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const browsers = await db.execute(sql`
      SELECT 
        coalesce(browser, 'Unknown') as browser,
        count(*)::int as sessions,
        count(distinct visitor_id)::int as visitors
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${fromDate}
        AND started_at <= ${toDate}
      GROUP BY browser
      ORDER BY sessions DESC
      LIMIT ${filter.limit};
    `);

    this.setInCache(cacheKey, browsers.rows, 30000); // 30 seconds TTL
    return browsers.rows;
  }

  static async getOperatingSystems(userId: string | undefined, filter: AnalyticsFilterInput) {
    await this.verifyAccess(filter.websiteId, userId);

    const { fromDate, toDate, cacheFrom, cacheTo } = this.parseDates(filter);
    const cacheKey = `os:${filter.websiteId}:${cacheFrom}:${cacheTo}:${filter.limit}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const os = await db.execute(sql`
      SELECT 
        coalesce(os, 'Unknown') as os,
        count(*)::int as sessions,
        count(distinct visitor_id)::int as visitors
      FROM sessions
      WHERE website_id = ${filter.websiteId}
        AND started_at >= ${fromDate}
        AND started_at <= ${toDate}
      GROUP BY os
      ORDER BY sessions DESC
      LIMIT ${filter.limit};
    `);

    this.setInCache(cacheKey, os.rows, 30000); // 30 seconds TTL
    return os.rows;
  }
}
