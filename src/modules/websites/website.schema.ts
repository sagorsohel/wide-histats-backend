import { z } from "zod";

export const createWebsiteSchema = z.object({
  name: z.string().min(1, "Website name is required").max(100),
  domain: z
    .string()
    .min(1, "Domain is required")
    .transform((val) =>
      val
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase()
    ),
  isPublic: z.boolean().optional().default(false),
  timezone: z.string().optional().default("Asia/Dhaka"),
  country: z.string().optional().default("Bangladesh"),
});

export const updateWebsiteSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domain: z
    .string()
    .transform((val) =>
      val
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase()
    )
    .optional(),
  isPublic: z.boolean().optional(),
  status: z.enum(["active", "paused"]).optional(),
  timezone: z.string().optional(),
  country: z.string().optional(),
});

export const websiteIdParamSchema = z.object({
  id: z.string().uuid("Invalid website ID format"),
});

export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
