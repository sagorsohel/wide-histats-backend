import { pgTable, uuid, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const websites = pgTable(
  "websites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    trackingId: text("tracking_id").notNull().unique(),
    status: text("status").default("active").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tracking_id_idx").on(table.trackingId),
    index("website_user_idx").on(table.userId),
  ]
);

export type Website = typeof websites.$inferSelect;
export type NewWebsite = typeof websites.$inferInsert;
