import {
  BUILTIN_SMS_TEMPLATES,
  LOYALTY_SMS_PLACEHOLDERS,
  type SmsTemplatePurpose,
  builtinSmsTemplateByKey,
} from "@/lib/sms-templates/catalog";

export type SmsTemplateDto = {
  id: string | null;
  key: string;
  name: string;
  purpose: SmsTemplatePurpose;
  body: string;
  active: boolean;
  placeholders: string[];
  builtin: boolean;
  saved: boolean;
};

type StoredSmsTemplate = {
  id: string;
  key: string;
  name: string;
  purpose: string;
  body: string;
  active: boolean;
};

export function mergeSmsTemplates(stored: StoredSmsTemplate[]): SmsTemplateDto[] {
  const byKey = new Map(stored.map((t) => [t.key, t]));
  const out: SmsTemplateDto[] = [];

  for (const builtin of BUILTIN_SMS_TEMPLATES) {
    const row = byKey.get(builtin.key);
    out.push({
      id: row?.id ?? null,
      key: builtin.key,
      name: row?.name ?? builtin.name,
      purpose: builtin.purpose,
      body: row?.body ?? builtin.body,
      active: row?.active ?? true,
      placeholders: [...LOYALTY_SMS_PLACEHOLDERS],
      builtin: true,
      saved: Boolean(row),
    });
    byKey.delete(builtin.key);
  }

  for (const row of byKey.values()) {
    const purpose =
      row.purpose === "gold_wish" ||
      row.purpose === "platinum_wish" ||
      row.purpose === "custom"
        ? row.purpose
        : "custom";
    out.push({
      id: row.id,
      key: row.key,
      name: row.name,
      purpose,
      body: row.body,
      active: row.active,
      placeholders: [...LOYALTY_SMS_PLACEHOLDERS],
      builtin: false,
      saved: true,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/** Pool for random send: merged builtins + DB, then filter by purpose/active. */
export function listMergedTemplatesForSend(stored: StoredSmsTemplate[]): Array<{
  key: string;
  purpose: string;
  body: string;
  active: boolean;
}> {
  return mergeSmsTemplates(stored).map((t) => ({
    key: t.key,
    purpose: t.purpose,
    body: t.body,
    active: t.active,
  }));
}

export function resolveBuiltinPurpose(key: string): SmsTemplatePurpose | null {
  return builtinSmsTemplateByKey(key)?.purpose ?? null;
}
