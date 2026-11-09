import { pgTable, uuid, text, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { websites } from "./websites.js";

export const counters = pgTable(
  "counters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }).notNull(),
    counterId: text("counter_id").notNull(),
    name: text("name").default("Standard counter").notNull(),
    style: text("style").default("hidden").notNull(),
    isHidden: boolean("is_hidden").default(true).notNull(),
    isMain: boolean("is_main").default(false).notNull(),
    displayOptions: jsonb("display_options").default({ visitorsToday: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("counter_website_idx").on(table.websiteId),
    uniqueIndex("counter_unique_code_idx").on(table.websiteId, table.counterId),
  ]
);

export type Counter = typeof counters.$inferSelect;
export type NewCounter = typeof counters.$inferInsert;

