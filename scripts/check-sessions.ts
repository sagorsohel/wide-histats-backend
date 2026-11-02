import { db, pool } from "../src/db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`
    SELECT id, ip_address, session_key, started_at, last_seen_at 
    FROM sessions 
    ORDER BY started_at DESC 
    LIMIT 10
  `);
  console.log("SESSIONS SAMPLE:", JSON.stringify(r.rows, null, 2));
  await pool.end();
}

main().catch(console.error);
