import { z } from "zod";

export const trackPageViewSchema = z.object({
  websiteId: z.string().min(1, "Tracking website ID is required"),
  url: z.string().min(1, "URL is required"),
  path: z.string().default("/"),
  title: z.string().optional().default(""),
  referrer: z.string().optional().default(""),
  visitorKey: z.string().min(1, "Visitor key is required"),
  sessionKey: z.string().min(1, "Session key is required"),
  screen: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

export const trackHeartbeatSchema = z.object({
  websiteId: z.string().min(1, "Tracking website ID is required"),
  visitorKey: z.string().min(1, "Visitor key is required"),
  sessionKey: z.string().min(1, "Session key is required"),
  path: z.string().optional(),
});

export const trackEventSchema = z.object({
  websiteId: z.string().min(1, "Tracking website ID is required"),
  visitorKey: z.string().min(1, "Visitor key is required"),
  sessionKey: z.string().min(1, "Session key is required"),
  eventName: z.string().min(1, "Event name is required"),
  eventData: z.record(z.any()).optional(),
});

export type TrackPageViewInput = z.infer<typeof trackPageViewSchema>;
export type TrackHeartbeatInput = z.infer<typeof trackHeartbeatSchema>;
export type TrackEventInput = z.infer<typeof trackEventSchema>;
