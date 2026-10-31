import { pgTable, uuid, text, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { websites } from "./websites.js";

export const dailyStats = pgTable(
  "daily_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }).notNull(),
    date: text("date").notNull(), // format: YYYY-MM-DD
    visitors: integer("visitors").default(0).notNull(),
    sessions: integer("sessions").default(0).notNull(),
    pageviews: integer("pageviews").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("daily_stats_website_date_idx").on(table.websiteId, table.date),
    index("daily_stats_website_idx").on(table.websiteId),
  ]
);

export type DailyStat = typeof dailyStats.$inferSelect;
export type NewDailyStat = typeof dailyStats.$inferInsert;
