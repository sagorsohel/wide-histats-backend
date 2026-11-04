import { db } from "../db/index.js";
import { websites } from "../db/schema/websites.js";
import { users } from "../db/schema/users.js";
import { eq, sql } from "drizzle-orm";

async function main() {
  const allUsers = await db.select().from(users);
  if (allUsers.length === 0) {
    console.error("No users found");
    process.exit(1);
  }

  const primaryUser = allUsers.find(u => u.email === "admin@gmail.com") || allUsers[0];
  console.log(`Using primary user: ${primaryUser.email} (${primaryUser.id})`);

  const sitesToSeed = [
    {
      name: "cinemovies.net",
      domain: "cinemovies.net",
      trackingId: "4867995",
    },
    {
      name: "StreamESPN",
      domain: "streamespn.org",
      trackingId: "4867998",
    },
    {
      name: "mediatvlive.com",
      domain: "mediatvlive.com",
      trackingId: "4868013",
    },
    {
      name: "direktsports.com",
      domain: "direktsports.com",
      trackingId: "4868014",
    },
    {
      name: "fifaonscreen.com",
      domain: "fifaonscreen.com",
      trackingId: "5032429",
    },
    {
      name: "x-x-x-x-x-x-x-x-x-x-x-x.xxx",
      domain: "x-x-x-x-x-x-x-x-x-x-x-x.xxx",
      trackingId: "5050800",
    },
    {
      name: "fresh-site.com",
      domain: "fresh-site.com",
      trackingId: "5054366",
    },
    {
      name: "More jao",
      domain: "morejao.shoberkotha.com",
      trackingId: "5055120",
    },
  ];

  for (const s of sitesToSeed) {
    // Check if website exists by domain
    const [existing] = await db
      .select()
      .from(websites)
      .where(sql`lower(domain) = lower(${s.domain})`)
      .limit(1);

    if (existing) {
      console.log(`Updating existing site: ${s.domain} (${existing.id})`);
      await db
        .update(websites)
        .set({
          name: s.name,
          trackingId: s.trackingId,
          isPublic: true,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(websites.id, existing.id));
    } else {
      console.log(`Inserting new site: ${s.domain}`);
      await db.insert(websites).values({
        userId: primaryUser.id,
        name: s.name,
        domain: s.domain,
        trackingId: s.trackingId,
        isPublic: true,
        status: "active",
      });
    }
  }

  // Also ensure any other users (like admin@widehistat.com) can access them by setting isPublic = true
  await db.update(websites).set({ isPublic: true });

  const finalSites = await db.select().from(websites);
  console.log(`Total websites in DB now: ${finalSites.length}`);
  for (const f of finalSites) {
    console.log(`- [${f.trackingId}] ${f.name} (${f.domain}) -> ${f.id}`);
  }

  process.exit(0);
}

main().catch(console.error);
