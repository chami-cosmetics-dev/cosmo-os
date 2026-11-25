import type { SmsTemplatePurpose } from "@/lib/sms-templates/catalog";

export type SelectableSmsTemplate = {
  key: string;
  purpose: string;
  body: string;
  active: boolean;
};

/**
 * Active templates matching purpose. Empty body excluded from pool.
 */
export function filterActiveSmsTemplatePool(
  templates: SelectableSmsTemplate[],
  purpose: SmsTemplatePurpose,
): SelectableSmsTemplate[] {
  return templates.filter(
    (t) => t.active && t.purpose === purpose && t.body.trim().length > 0,
  );
}

/** Uniform random pick. Returns null if pool empty. */
export function pickRandomSmsTemplate<T>(
  pool: T[],
  random: () => number = Math.random,
): T | null {
  if (pool.length === 0) return null;
  const index = Math.floor(random() * pool.length);
  return pool[index] ?? null;
}
