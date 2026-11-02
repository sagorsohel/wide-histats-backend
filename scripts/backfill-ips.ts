import { db, pool } from "../src/db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE sessions 
    SET ip_address = (
      CASE (abs(hashtext(coalesce(visitor_id::text, id::text))) % 7)
        WHEN 0 THEN '103.145.72.' || ((abs(hashtext(id::text)) % 240) + 10)::text
        WHEN 1 THEN '185.220.101.' || ((abs(hashtext(id::text)) % 240) + 10)::text
        WHEN 2 THEN '45.154.255.' || ((abs(hashtext(id::text)) % 240) + 10)::text
        WHEN 3 THEN '194.26.29.' || ((abs(hashtext(id::text)) % 240) + 10)::text
        WHEN 4 THEN '102.130.112.' || ((abs(hashtext(id::text)) % 240) + 10)::text
        WHEN 5 THEN '178.62.204.' || ((abs(hashtext(id::text)) % 240) + 10)::text
        ELSE '82.165.197.' || ((abs(hashtext(id::text)) % 240) + 10)::text
      END
    )
    WHERE ip_address IS NULL;
  `);

  console.log("Updated sessions without IP:", result);
  await pool.end();
}

main().catch(console.error);
