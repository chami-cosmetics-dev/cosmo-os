/**
 * Built-in SMS template keys + defaults for loyalty wishes.
 * Companies can override via SmsTemplate rows and add custom keys.
 */

export const SMS_TEMPLATE_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

export type SmsTemplatePurpose = "gold_wish" | "platinum_wish" | "custom";

export type SmsTemplateDefinition = {
  key: string;
  name: string;
  purpose: SmsTemplatePurpose;
  body: string;
  placeholders: string[];
  builtin: boolean;
};

export const LOYALTY_SMS_PLACEHOLDERS = [
  "customerName",
  "tier",
  "discountPercent",
  "merchantName",
  "merchantPhone",
  "officePhone",
] as const;

export const LOYALTY_GOLD_WISH_1_KEY = "loyalty_gold_wish_1";
export const LOYALTY_GOLD_WISH_2_KEY = "loyalty_gold_wish_2";
export const LOYALTY_PLATINUM_WISH_1_KEY = "loyalty_platinum_wish_1";
export const LOYALTY_PLATINUM_WISH_2_KEY = "loyalty_platinum_wish_2";

const GOLD_BODY_1 =
  "Dear {{customerName}}, congratulations on becoming a Gold loyalty customer at cosmetics.lk! Enjoy {{discountPercent}}% off your orders. For your next order contact {{merchantName}} on {{merchantPhone}} or our office on {{officePhone}}. Thank you for shopping with us!";

const GOLD_BODY_2 =
  "Hi {{customerName}}! Welcome to Gold loyalty — you now get {{discountPercent}}% discount. Reach {{merchantName}} ({{merchantPhone}}) or office {{officePhone}} for your next order. Warm wishes from cosmetics.lk!";

const PLATINUM_BODY_1 =
  "Dear {{customerName}}, congratulations on Platinum loyalty at cosmetics.lk! Enjoy {{discountPercent}}% off. Contact {{merchantName}} on {{merchantPhone}} or office {{officePhone}} for your next order. Thank you!";

const PLATINUM_BODY_2 =
  "Hi {{customerName}}! You are now Platinum — enjoy {{discountPercent}}% discount on your purchases. Call {{merchantName}} ({{merchantPhone}}) or office {{officePhone}} anytime for your next order. Best wishes from cosmetics.lk!";

export const BUILTIN_SMS_TEMPLATES: SmsTemplateDefinition[] = [
  {
    key: LOYALTY_GOLD_WISH_1_KEY,
    name: "Gold wish A",
    purpose: "gold_wish",
    body: GOLD_BODY_1,
    placeholders: [...LOYALTY_SMS_PLACEHOLDERS],
    builtin: true,
  },
  {
    key: LOYALTY_GOLD_WISH_2_KEY,
    name: "Gold wish B",
    purpose: "gold_wish",
    body: GOLD_BODY_2,
    placeholders: [...LOYALTY_SMS_PLACEHOLDERS],
    builtin: true,
  },
  {
    key: LOYALTY_PLATINUM_WISH_1_KEY,
    name: "Platinum wish A",
    purpose: "platinum_wish",
    body: PLATINUM_BODY_1,
    placeholders: [...LOYALTY_SMS_PLACEHOLDERS],
    builtin: true,
  },
  {
    key: LOYALTY_PLATINUM_WISH_2_KEY,
    name: "Platinum wish B",
    purpose: "platinum_wish",
    body: PLATINUM_BODY_2,
    placeholders: [...LOYALTY_SMS_PLACEHOLDERS],
    builtin: true,
  },
];

export function isValidSmsTemplateKey(key: string): boolean {
  return SMS_TEMPLATE_KEY_RE.test(key);
}

export function builtinSmsTemplateByKey(key: string): SmsTemplateDefinition | undefined {
  return BUILTIN_SMS_TEMPLATES.find((t) => t.key === key);
}

export function purposeForLoyaltyTier(tier: "gold" | "platinum"): SmsTemplatePurpose {
  return tier === "platinum" ? "platinum_wish" : "gold_wish";
}

export function discountPercentForTier(tier: "gold" | "platinum"): number {
  return tier === "platinum" ? 15 : 10;
}

export function tierLabel(tier: "gold" | "platinum"): string {
  return tier === "platinum" ? "Platinum" : "Gold";
}

export function isSmsTemplatePurpose(value: string): value is SmsTemplatePurpose {
  return value === "gold_wish" || value === "platinum_wish" || value === "custom";
}
