import { z } from "zod";

import { cuidSchema } from "@/lib/validation";

export const contactEmailCleanupReasonSchema = z.enum(["invalid", "cosmetics_pattern"]);

export const contactEmailCleanupListQuerySchema = z.object({
  reason: contactEmailCleanupReasonSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const contactEmailCleanupClearBodySchema = z.object({
  reason: contactEmailCleanupReasonSchema,
  contactIds: z.array(cuidSchema).min(1).max(50),
});

export type ContactEmailCleanupReason = z.infer<typeof contactEmailCleanupReasonSchema>;
