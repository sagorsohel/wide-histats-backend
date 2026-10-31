import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

export class AggregationService {
  private static timer: NodeJS.Timeout | null = null;

  static start() {
    // Run initial aggregation 5 seconds after startup
    setTimeout(() => {
      this.aggregate().catch((err) => {
        logger.warn(`Initial daily stats aggregation notice: ${err.message}`);
      });
    }, 5000);

    // Schedule daily aggregation every 4 hours
    this.timer = setInterval(() => {
      this.aggregate().catch((err) => {
        logger.warn(`Scheduled daily stats aggregation error: ${err.message}`);
      });
    }, 4 * 60 * 60 * 1000);
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async aggregate(dateStr?: string) {
    try {
      // Default to today and yesterday
      const datesToProcess: string[] = dateStr
        ? [dateStr]
        : [
            new Date(Date.now() - 86400000).toISOString().split("T")[0],
            new Date().toISOString().split("T")[0],
          ];

      for (const targetDate of datesToProcess) {
        await db.execute(sql`
          INSERT INTO daily_stats (id, website_id, date, visitors, sessions, pageviews, created_at, updated_at)
          SELECT 
            gen_random_uuid(),
            website_id,
            to_char(viewed_at, 'YYYY-MM-DD') as date,
            count(distinct visitor_id)::int as visitors,
            count(distinct session_id)::int as sessions,
            count(*)::int as pageviews,
            now(),
            now()
          FROM page_views
          WHERE to_char(viewed_at, 'YYYY-MM-DD') = ${targetDate}
          GROUP BY website_id, to_char(viewed_at, 'YYYY-MM-DD')
          ON CONFLICT (website_id, date)
          DO UPDATE SET
            visitors = EXCLUDED.visitors,
            sessions = EXCLUDED.sessions,
            pageviews = EXCLUDED.pageviews,
            updated_at = now();
        `);
      }

      logger.info(`Daily stats aggregation completed for dates: ${datesToProcess.join(", ")}`);
    } catch (error: any) {
      logger.error("Failed to run daily stats aggregation:", error);
    }
  }
}
