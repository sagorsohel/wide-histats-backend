import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { websites } from "./websites.js";
import { visitors } from "./visitors.js";
import { sessions } from "./sessions.js";

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }).notNull(),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "cascade" }).notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }).notNull(),
    eventName: text("event_name").notNull(),
    eventData: jsonb("event_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("event_website_idx").on(table.websiteId),
    index("event_session_idx").on(table.sessionId),
  ]
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
