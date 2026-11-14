import { z } from "zod";

export const trackPageViewSchema = z.object({
  websiteId: z.string().min(1, "Tracking website ID is required"),
  url: z.string().min(1, "URL is required").max(2048),
  path: z.string().max(2048).default("/"),
  title: z.string().max(512).optional().default(""),
  referrer: z.string().max(2048).optional().default(""),
  visitorKey: z.string().min(1, "Visitor key is required").max(128),
  sessionKey: z.string().min(1, "Session key is required").max(128),
  screen: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

export const trackHeartbeatSchema = z.object({
  websiteId: z.string().min(1, "Tracking website ID is required"),
  visitorKey: z.string().min(1, "Visitor key is required").max(128),
  sessionKey: z.string().min(1, "Session key is required").max(128),
  path: z.string().optional(),
});

export const trackEventSchema = z.object({
  websiteId: z.string().min(1, "Tracking website ID is required"),
  visitorKey: z.string().min(1, "Visitor key is required").max(128),
  sessionKey: z.string().min(1, "Session key is required").max(128),
  eventName: z.string().min(1, "Event name is required").max(128),
  eventData: z
    .record(z.any())
    .optional()
    .refine((v) => !v || JSON.stringify(v).length <= 8192, "eventData too large (max 8KB)"),
});

export type TrackPageViewInput = z.infer<typeof trackPageViewSchema>;
export type TrackHeartbeatInput = z.infer<typeof trackHeartbeatSchema>;
export type TrackEventInput = z.infer<typeof trackEventSchema>;
