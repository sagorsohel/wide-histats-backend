import { pool } from "../src/db/index.js";
import { ensureAdminSeed } from "../src/db/seed.js";

// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npx tsx scripts/seed-admin.ts
export async function seedAdminUser() {
  return ensureAdminSeed();
}

if (process.argv[1]?.includes("seed-admin")) {
  seedAdminUser()
    .then(async () => {
      console.log("[SEED] Done seeding admin.");
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[SEED ERROR]", err);
      await pool.end();
      process.exit(1);
    });
}
