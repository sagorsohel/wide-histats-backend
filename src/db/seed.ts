import { eq } from "drizzle-orm";
import { pool, db } from "./index.js";
import { users } from "./schema/users.js";
import { websites } from "./schema/websites.js";
import { visitors } from "./schema/visitors.js";
import { sessions } from "./schema/sessions.js";
import { pageviews } from "./schema/pageviews.js";
import { visitorLocations } from "./schema/visitor-locations.js";
import { hashPassword } from "../utils/password.js";
import { logger } from "../utils/logger.js";
import { runMigrations } from "./migrate.js";
import crypto from "crypto";
import { env } from "../config/env.js";

export const ensureAdminSeed = async () => {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const name = "Admin";

  if (!email || !password) {
    logger.info("[Startup Seed] ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping admin bootstrap.");
    return null;
  }

  try {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId: string;

    if (!existingUser) {
      const passwordHash = await hashPassword(password);
      const [user] = await db
        .insert(users)
        .values({ name, email, passwordHash })
        .returning();
      userId = user.id;
      logger.info(`[Startup Seed] Created admin user: ${email}`);
    } else {
      // Never overwrite an existing password on restart.
      userId = existingUser.id;
    }

    // Only create a demo website when the database has no websites at all.
    const [anyWebsite] = await db.select({ id: websites.id }).from(websites).limit(1);
    if (!anyWebsite) {
      await db.insert(websites).values({
        userId,
        name: "StreamESPN",
        domain: "streamespn.org",
        trackingId: "wid_demo9876543210",
        isPublic: true,
      });
      logger.info(`[Startup Seed] Created default website for admin: ${email}`);
    }

    return userId;
  } catch (err: any) {
    logger.warn(`[Startup Seed] Notice: Admin seeding skipped or encountered error: ${err.message}`);
    return null;
  }
};

export const seedDatabase = async () => {
  logger.info("Starting database seed...");
  await runMigrations();

  // 1. Seed admin user (from ADMIN_EMAIL / ADMIN_PASSWORD)
  const userId = await ensureAdminSeed();
  if (!userId) {
    logger.error("Failed to seed admin user.");
    return;
  }

  // 2. Ensure website exists
  const [existingWebsite] = await db
    .select()
    .from(websites)
    .where(eq(websites.userId, userId))
    .limit(1);

  let websiteId: string;
  if (!existingWebsite) {
    const [website] = await db
      .insert(websites)
      .values({
        userId,
        name: "StreamESPN",
        domain: "streamespn.org",
        trackingId: "wid_demo9876543210",
        isPublic: true,
      })
      .returning();
    websiteId = website.id;
    logger.info(`Created demo website: ${website.name} (trackingId: ${website.trackingId})`);
  } else {
    websiteId = existingWebsite.id;
    logger.info(`Existing website found: ${existingWebsite.name}`);
  }

  // 3. Seed realistic sample analytics events (past 7 days)
  const paths = ["/", "/blog", "/blog/react-vs-vue", "/blog/nodejs-tips", "/pricing", "/about", "/contact"];
  const browsers = ["Chrome", "Firefox", "Safari", "Edge"];
  const osList = ["Windows", "macOS", "Linux", "iOS", "Android"];
  const devices = ["desktop", "mobile", "tablet"];
  const sources = [
    { source: "google", medium: "organic" },
    { source: "facebook", medium: "social" },
    { source: "twitter", medium: "social" },
    { source: "linkedin", medium: "social" },
    { source: "direct", medium: "none" },
    { source: "newsletter", medium: "email" },
  ];
  const locations = [
    { countryCode: "BD", country: "Bangladesh", city: "Dhaka", lat: 23.8103, lng: 90.4125 },
    { countryCode: "US", country: "United States", city: "New York", lat: 40.7128, lng: -74.006 },
    { countryCode: "GB", country: "United Kingdom", city: "London", lat: 51.5074, lng: -0.1278 },
    { countryCode: "IN", country: "India", city: "Delhi", lat: 28.6139, lng: 77.209 },
    { countryCode: "CA", country: "Canada", city: "Toronto", lat: 43.6532, lng: -79.3832 },
  ];

  logger.info("Generating realistic sample visitor sessions and pageviews...");

  for (let i = 0; i < 30; i++) {
    const visitorKey = "demo_vk_" + crypto.randomBytes(6).toString("hex");
    const loc = locations[i % locations.length];
    const daysAgo = Math.floor(Math.random() * 7);
    const eventTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 3600000);

    const [visitor] = await db
      .insert(visitors)
      .values({
        websiteId,
        visitorKey,
        firstSeenAt: eventTime,
        lastSeenAt: eventTime,
      })
      .returning();

    await db.insert(visitorLocations).values({
      websiteId,
      visitorId: visitor.id,
      countryCode: loc.countryCode,
      country: loc.country,
      region: loc.city,
      city: loc.city,
      latitude: loc.lat,
      longitude: loc.lng,
      createdAt: eventTime,
    });

    const sessionKey = "demo_sk_" + crypto.randomBytes(6).toString("hex");
    const src = sources[i % sources.length];
    const browser = browsers[i % browsers.length];
    const os = osList[i % osList.length];
    const deviceType = devices[i % devices.length];
    const landing = paths[Math.floor(Math.random() * paths.length)];

    const [session] = await db
      .insert(sessions)
      .values({
        websiteId,
        visitorId: visitor.id,
        sessionKey,
        source: src.source,
        medium: src.medium,
        landingPage: landing,
        exitPage: landing,
        browser,
        os,
        deviceType,
        startedAt: eventTime,
        lastSeenAt: new Date(eventTime.getTime() + 180000), // 3 mins later
      })
      .returning();

    // 1 to 4 pageviews per session
    const pvCount = Math.floor(Math.random() * 3) + 1;
    for (let p = 0; p < pvCount; p++) {
      const pagePath = paths[(i + p) % paths.length];
      await db.insert(pageviews).values({
        websiteId,
        visitorId: visitor.id,
        sessionId: session.id,
        pageUrl: `https://techblog.example.com${pagePath}`,
        pagePath,
        pageTitle: pagePath === "/" ? "Home" : pagePath.replace("/", "").replace(/-/g, " ").toUpperCase(),
        referrer: p === 0 && src.source !== "direct" ? `https://${src.source}.com` : undefined,
        viewedAt: new Date(eventTime.getTime() + p * 45000),
      });
    }
  }

  logger.info("Sample database seed finished successfully!");
};

if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("Seed failed:", err);
      process.exit(1);
    });
}
