import { timingSafeEqual } from "crypto";

export function verifyFinanceHodRevertPassword(password: string): boolean {
  const expected = process.env.FINANCE_HOD_REVERT_PASSWORD?.trim();
  if (!expected || !password) return false;

  const provided = Buffer.from(password);
  const secret = Buffer.from(expected);
  if (provided.length !== secret.length) return false;

  return timingSafeEqual(provided, secret);
}
