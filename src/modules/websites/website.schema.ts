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
});

export const websiteIdParamSchema = z.object({
  id: z.string().uuid("Invalid website ID format"),
});

export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
