import { randomBytes } from "node:crypto";

export const INVITE_EXPIRY_HOURS = 2;

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function getInviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
}

export function isPasswordStrong(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}
