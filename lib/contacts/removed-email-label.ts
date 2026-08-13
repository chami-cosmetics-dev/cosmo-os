import type { ContactEmailCleanupReason } from "@/lib/validation/contact-email-cleanup";

/** Admin Insight label for a cleared email row. */
export function formatRemovedEmailLabel(
  reason: ContactEmailCleanupReason,
  email: string
): string {
  const quoted = `'${email}'`;
  if (reason === "cosmetics_pattern") return `cosmetic mail - ${quoted}`;
  return `invalid mail - ${quoted}`;
}
