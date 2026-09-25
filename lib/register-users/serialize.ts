import { formatAppIsoDate } from "@/lib/format-datetime";
import type { RegisterOutcome } from "@/lib/register-users/outcome";
import type { RegisterCaptureRow } from "@/lib/register-users/types";

export function serializeCaptureRow(input: {
  id: string;
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  location: string;
  badgeStart: Date;
  badgeEnd: Date;
  source: string;
  outcome: string;
  createdAt: Date;
  mailStatus?: "sent" | "skipped" | "failed" | null;
  mailError?: string | null;
}): RegisterCaptureRow {
  const mailStatus =
    input.mailStatus === "sent" ||
    input.mailStatus === "skipped" ||
    input.mailStatus === "failed"
      ? input.mailStatus
      : null;
  return {
    id: input.id,
    contactId: input.contactId,
    name: input.name,
    phone: input.phone,
    email: input.email,
    location: input.location,
    badgeStart: formatAppIsoDate(input.badgeStart),
    badgeEnd: formatAppIsoDate(input.badgeEnd),
    source: input.source === "portal" ? "portal" : "staff",
    outcome: input.outcome as RegisterOutcome,
    createdAt: input.createdAt.toISOString(),
    mailStatus,
    mailError: input.mailError ?? null,
  };
}
