import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const pvs = await db.execute(sql`SELECT * FROM page_views WHERE page_url LIKE '%morejao%' OR page_title LIKE '%ENJOY%'`);
  console.log("Matching morejao in page_views:", pvs.rows);

  const allWebsites = await db.execute(sql`SELECT * FROM websites`);
  console.log("All websites in DB:", allWebsites.rows);

  process.exit(0);
}

main().catch(console.error);
