import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";
import * as relations from "./relations.js";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err: any) => {
  // Prevent unhandled errors from idle clients disconnecting in Neon pooler
  logger.warn(`PostgreSQL idle client notice: ${err?.message || err}`);
});

export const db = drizzle(pool, {
  schema: { ...schema, ...relations },
});

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info("Successfully connected to PostgreSQL database.");
    return true;
  } catch (error: any) {
    logger.warn(`PostgreSQL connection check failed: ${error.message}. Running in development mode with DATABASE_URL=${env.DATABASE_URL}`);
    return false;
  }
};
