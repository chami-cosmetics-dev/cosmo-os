import type { RegisterOutcome } from "@/lib/register-users/outcome";

export type RegisterSource = "staff" | "portal";

export type RegisterCaptureRow = {
  id: string;
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  location: string;
  badgeStart: string;
  badgeEnd: string;
  source: RegisterSource;
  outcome: RegisterOutcome;
  createdAt: string;
  mailStatus: "sent" | "skipped" | "failed" | null;
  mailError: string | null;
};

export type RegisterPhoneMatch = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export class RegisterPhoneConflictError extends Error {
  matches: RegisterPhoneMatch[];

  constructor(matches: RegisterPhoneMatch[]) {
    super("Multiple contacts match this phone");
    this.name = "RegisterPhoneConflictError";
    this.matches = matches;
  }
}
