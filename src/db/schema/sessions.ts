import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { websites } from "./websites.js";
import { visitors } from "./visitors.js";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }).notNull(),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "cascade" }).notNull(),
    sessionKey: text("session_key").notNull(),
    source: text("source").default("direct").notNull(),
    medium: text("medium").default("none").notNull(),
    campaign: text("campaign"),
    referrer: text("referrer"),
    landingPage: text("landing_page"),
    exitPage: text("exit_page"),
    browser: text("browser"),
    browserVersion: text("browser_version"),
    os: text("os"),
    osVersion: text("os_version"),
    deviceType: text("device_type").default("desktop"),
    ipAddress: text("ip_address"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("session_website_started_idx").on(table.websiteId, table.startedAt),
    index("session_visitor_idx").on(table.visitorId),
    index("session_website_key_idx").on(table.websiteId, table.sessionKey),
  ]
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
