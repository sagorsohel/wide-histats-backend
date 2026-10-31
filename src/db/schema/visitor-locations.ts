import { pgTable, uuid, text, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";
import { visitors } from "./visitors.js";
import { websites } from "./websites.js";

export const visitorLocations = pgTable(
  "visitor_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }).notNull(),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "cascade" }).notNull(),
    countryCode: text("country_code"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("location_website_idx").on(table.websiteId),
    index("location_visitor_idx").on(table.visitorId),
    index("location_country_idx").on(table.websiteId, table.countryCode),
  ]
);

export type VisitorLocation = typeof visitorLocations.$inferSelect;
export type NewVisitorLocation = typeof visitorLocations.$inferInsert;
