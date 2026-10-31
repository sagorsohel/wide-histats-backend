import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { websites } from "./websites.js";
import { visitors } from "./visitors.js";
import { sessions } from "./sessions.js";

export const pageviews = pgTable(
  "page_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }).notNull(),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "cascade" }).notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }).notNull(),
    pageUrl: text("page_url").notNull(),
    pagePath: text("page_path").notNull(),
    pageTitle: text("page_title"),
    referrer: text("referrer"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pageview_website_viewed_idx").on(table.websiteId, table.viewedAt),
    index("pageview_session_idx").on(table.sessionId),
    index("pageview_website_path_idx").on(table.websiteId, table.pagePath),
  ]
);

export type Pageview = typeof pageviews.$inferSelect;
export type NewPageview = typeof pageviews.$inferInsert;
