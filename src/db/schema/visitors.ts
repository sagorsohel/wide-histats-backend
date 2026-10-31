import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { websites } from "./websites.js";

export const visitors = pgTable(
  "visitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }).notNull(),
    visitorKey: text("visitor_key").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("website_visitor_key_idx").on(table.websiteId, table.visitorKey),
    index("visitor_website_id_idx").on(table.websiteId),
    index("visitor_last_seen_idx").on(table.lastSeenAt),
  ]
);

export type Visitor = typeof visitors.$inferSelect;
export type NewVisitor = typeof visitors.$inferInsert;
