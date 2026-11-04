import { pool } from "./index.js";
import { logger } from "../utils/logger.js";

export const runMigrations = async () => {
  logger.info("Initializing PostgreSQL schema tables if not present...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Enable uuid-ossp or pgcrypto extension if available
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    // Refresh Tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `);

    // Websites table
    await client.query(`
      CREATE TABLE IF NOT EXISTS websites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        tracking_id TEXT NOT NULL UNIQUE,
        status TEXT DEFAULT 'active' NOT NULL,
        is_public BOOLEAN DEFAULT FALSE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
      ALTER TABLE websites ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
      ALTER TABLE websites ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Worldwide';
      CREATE INDEX IF NOT EXISTS website_user_idx ON websites (user_id);
    `);

    // Visitors table
    await client.query(`
      CREATE TABLE IF NOT EXISTS visitors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        visitor_key TEXT NOT NULL,
        first_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        last_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS website_visitor_key_idx ON visitors (website_id, visitor_key);
      CREATE INDEX IF NOT EXISTS visitor_website_id_idx ON visitors (website_id);
      CREATE INDEX IF NOT EXISTS visitor_last_seen_idx ON visitors (last_seen_at);
    `);

    // Sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        session_key TEXT NOT NULL,
        source TEXT DEFAULT 'direct' NOT NULL,
        medium TEXT DEFAULT 'none' NOT NULL,
        campaign TEXT,
        referrer TEXT,
        landing_page TEXT,
        exit_page TEXT,
        browser TEXT,
        browser_version TEXT,
        os TEXT,
        os_version TEXT,
        device_type TEXT DEFAULT 'desktop',
        ip_address TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        last_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        ended_at TIMESTAMPTZ
      );
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
      CREATE INDEX IF NOT EXISTS session_website_started_idx ON sessions (website_id, started_at);
      CREATE INDEX IF NOT EXISTS session_visitor_idx ON sessions (visitor_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_web_lastseen_desc ON sessions (website_id, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_web_started_desc ON sessions (website_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_web_started_source ON sessions (website_id, started_at, source, medium);
      CREATE INDEX IF NOT EXISTS idx_sessions_web_started_device ON sessions (website_id, started_at, device_type);
      CREATE INDEX IF NOT EXISTS idx_sessions_web_started_browser ON sessions (website_id, started_at, browser);
      CREATE INDEX IF NOT EXISTS idx_sessions_web_started_os ON sessions (website_id, started_at, os);
    `);

    // Page Views table
    await client.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        page_url TEXT NOT NULL,
        page_path TEXT NOT NULL,
        page_title TEXT,
        referrer TEXT,
        viewed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pageview_website_viewed_idx ON page_views (website_id, viewed_at);
      CREATE INDEX IF NOT EXISTS pageview_session_idx ON page_views (session_id);
      CREATE INDEX IF NOT EXISTS pageview_website_path_idx ON page_views (website_id, page_path);
      CREATE INDEX IF NOT EXISTS idx_pageviews_web_viewed_vis_sess ON page_views (website_id, viewed_at, visitor_id, session_id);
      CREATE INDEX IF NOT EXISTS idx_pageviews_web_visitor ON page_views (website_id, visitor_id);
      CREATE INDEX IF NOT EXISTS idx_pageviews_web_session_viewed ON page_views (website_id, session_id, viewed_at);
      CREATE INDEX IF NOT EXISTS idx_pageviews_web_viewed_desc ON page_views (website_id, viewed_at DESC);
    `);

    // Visitor Locations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS visitor_locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        country_code TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS location_website_idx ON visitor_locations (website_id);
      CREATE INDEX IF NOT EXISTS location_visitor_idx ON visitor_locations (visitor_id);
      CREATE INDEX IF NOT EXISTS location_country_idx ON visitor_locations (website_id, country_code);
    `);

    // Events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        event_name TEXT NOT NULL,
        event_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS event_website_idx ON events (website_id);
      CREATE INDEX IF NOT EXISTS event_session_idx ON events (session_id);
    `);

    // Daily Stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        visitors INTEGER DEFAULT 0 NOT NULL,
        sessions INTEGER DEFAULT 0 NOT NULL,
        pageviews INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS daily_stats_website_date_idx ON daily_stats (website_id, date);
      CREATE INDEX IF NOT EXISTS daily_stats_website_idx ON daily_stats (website_id);
    `);

    await client.query("COMMIT");
    logger.info("Database schema migration completed successfully.");
  } catch (err: any) {
    await client.query("ROLLBACK");
    logger.error("Migration failed:", err.message);
    throw err;
  } finally {
    client.release();
  }
};

if (process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
