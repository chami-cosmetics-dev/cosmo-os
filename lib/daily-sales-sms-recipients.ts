/** Client-safe recipient helpers for daily sales SMS (no Prisma / server-only). */

export const DAILY_SALES_SMS_MAX_RECIPIENTS = 20;

export function normalizeRecipientList(raw: unknown): string[] {
  const items: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") items.push(item);
    }
  } else if (typeof raw === "string") {
    items.push(...raw.split(/[\n,;]+/));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) continue;
    const key = digits;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.replace(/\s+/g, ""));
    if (out.length >= DAILY_SALES_SMS_MAX_RECIPIENTS) break;
  }
  return out;
}
