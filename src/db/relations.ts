import { relations } from "drizzle-orm";
import { users } from "./schema/users.js";
import { refreshTokens } from "./schema/refresh-tokens.js";
import { websites } from "./schema/websites.js";
import { visitors } from "./schema/visitors.js";
import { sessions } from "./schema/sessions.js";
import { pageviews } from "./schema/pageviews.js";
import { visitorLocations } from "./schema/visitor-locations.js";
import { dailyStats } from "./schema/daily-stats.js";
import { events } from "./schema/events.js";

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  websites: many(websites),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const websitesRelations = relations(websites, ({ one, many }) => ({
  owner: one(users, {
    fields: [websites.userId],
    references: [users.id],
  }),
  visitors: many(visitors),
  sessions: many(sessions),
  pageviews: many(pageviews),
  locations: many(visitorLocations),
  dailyStats: many(dailyStats),
  events: many(events),
}));

export const visitorsRelations = relations(visitors, ({ one, many }) => ({
  website: one(websites, {
    fields: [visitors.websiteId],
    references: [websites.id],
  }),
  sessions: many(sessions),
  pageviews: many(pageviews),
  location: one(visitorLocations, {
    fields: [visitors.id],
    references: [visitorLocations.visitorId],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  website: one(websites, {
    fields: [sessions.websiteId],
    references: [websites.id],
  }),
  visitor: one(visitors, {
    fields: [sessions.visitorId],
    references: [visitors.id],
  }),
  pageviews: many(pageviews),
  events: many(events),
}));

export const pageviewsRelations = relations(pageviews, ({ one }) => ({
  website: one(websites, {
    fields: [pageviews.websiteId],
    references: [websites.id],
  }),
  session: one(sessions, {
    fields: [pageviews.sessionId],
    references: [sessions.id],
  }),
  visitor: one(visitors, {
    fields: [pageviews.visitorId],
    references: [visitors.id],
  }),
}));
