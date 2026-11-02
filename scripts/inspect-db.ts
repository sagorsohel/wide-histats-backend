import { db, pool } from "../src/db/index.js";
import { users } from "../src/db/schema/users.js";
import { websites } from "../src/db/schema/websites.js";

async function main() {
  const allUsers = await db.select().from(users);
  console.log("ALL USERS IN DB:", allUsers.map(u => ({ id: u.id, email: u.email, name: u.name, hashPrefix: u.passwordHash.substring(0, 15) })));

  const allWebsites = await db.select().from(websites);
  console.log("ALL WEBSITES IN DB:", allWebsites.map(w => ({ id: w.id, name: w.name, domain: w.domain, trackingId: w.trackingId, userId: w.userId })));

  await pool.end();
}

main().catch(err => {
  console.error("DB check failed:", err);
  process.exit(1);
});
