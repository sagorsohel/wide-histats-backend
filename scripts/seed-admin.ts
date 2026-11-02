import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/index.js";
import { users } from "../src/db/schema/users.js";
import { websites } from "../src/db/schema/websites.js";
import { hashPassword } from "../src/utils/password.js";

export async function seedAdminUser() {
  const email = "admin@gmail.com";
  const password = "sohoj@sohoj";
  const name = "Admin";

  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let adminId: string;
  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
      })
      .returning();
    adminId = created.id;
    console.log(`[SEED] Created admin user: ${email} with password: ${password}`);
  } else {
    adminId = existing.id;
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`[SEED] Existing admin user updated: ${email} with password: ${password}`);
  }

  // Also check if websites need to be linked or if default website exists
  const userWebsites = await db
    .select()
    .from(websites)
    .where(eq(websites.userId, adminId))
    .limit(1);

  if (userWebsites.length === 0) {
    // Check if there are orphaned websites or old demo websites
    const allWebsites = await db.select().from(websites);
    if (allWebsites.length > 0) {
      // Reassign existing websites to this admin so they appear on dashboard
      for (const w of allWebsites) {
        await db
          .update(websites)
          .set({ userId: adminId })
          .where(eq(websites.id, w.id));
        console.log(`[SEED] Linked website "${w.name}" (${w.domain}) to admin ${email}`);
      }
    } else {
      // Create a default website
      const [newSite] = await db
        .insert(websites)
        .values({
          userId: adminId,
          name: "My Website",
          domain: "example.com",
          trackingId: "wid_" + Math.random().toString(36).substring(2, 12),
          isPublic: true,
        })
        .returning();
      console.log(`[SEED] Created default website: ${newSite.name} (${newSite.trackingId}) for ${email}`);
    }
  }

  return adminId;
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
