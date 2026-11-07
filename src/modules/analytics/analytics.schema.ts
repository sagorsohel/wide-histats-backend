import { z } from "zod";

export const analyticsFilterSchema = z.object({
  websiteId: z.string().min(1, "Website ID is required"),
  from: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))),
  to: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : new Date())),
  limit: z.coerce.number().min(1).max(100).default(10),
  page: z.coerce.number().min(1).default(1),
});

export type AnalyticsFilterInput = z.infer<typeof analyticsFilterSchema>;
