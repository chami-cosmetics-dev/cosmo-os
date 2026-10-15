export const GIFT_VOUCHER_READ_PERMISSION = "products.gift_vouchers.read";
export const GIFT_VOUCHER_MANAGE_PERMISSION = "products.gift_vouchers.manage";

export const GIFT_VOUCHER_STATUSES = ["PENDING", "ACTIVE", "EXPIRED", "USED"] as const;
export type GiftVoucherStatus = (typeof GIFT_VOUCHER_STATUSES)[number];

export const GIFT_VOUCHER_STATUS_LABELS: Record<GiftVoucherStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  USED: "Used",
};

/** Which date the manager's date-range filter applies to. */
export const GIFT_VOUCHER_DATE_FIELDS = ["used", "start"] as const;
export type GiftVoucherDateField = (typeof GIFT_VOUCHER_DATE_FIELDS)[number];

/**
 * Generated codes are COS + group number + 5 random digits, e.g. COS14148213 (group 141).
 * Group numbers grow past 999 naturally into 4 digits.
 */
export const GIFT_VOUCHER_CODE_BRAND = "COS";
export const GIFT_VOUCHER_GROUP_NUMBER_DIGITS = 3;
export const GIFT_VOUCHER_RANDOM_DIGITS = 5;
const GIFT_VOUCHER_RANDOM_MAX = 10 ** GIFT_VOUCHER_RANDOM_DIGITS - 1;
/** The first group number handed out by the permanent per-company counter. */
export const GIFT_VOUCHER_FIRST_GROUP_NUMBER = 141;
export const GIFT_VOUCHER_MAX_QUANTITY = 10000;
export const GIFT_VOUCHER_CODE_PATTERN = /^[A-Z0-9_-]{1,60}$/;

/** Generate PREFIX + running number, or take the codes the creator typed or pasted. */
export const GIFT_VOUCHER_CODE_MODES = ["generate", "manual"] as const;
export type GiftVoucherCodeMode = (typeof GIFT_VOUCHER_CODE_MODES)[number];

export type GiftVoucherCheckResult = "VALID" | "USED" | "EXPIRED" | "NOT_YET_ACTIVE" | "NOT_FOUND";

export const GIFT_VOUCHER_CHECK_LABELS: Record<GiftVoucherCheckResult, string> = {
  VALID: "Valid",
  USED: "Used",
  EXPIRED: "Expired",
  NOT_YET_ACTIVE: "Not yet active",
  NOT_FOUND: "Not found",
};

export type GiftVoucherGroupOption = {
  id: string;
  groupNumber: number;
  name: string;
  codePrefix: string;
  quantity: number;
  startDate: string;
  endDate: string;
};

/** One batch code row as shown in the table. */
export type GiftVoucherCodeRow = {
  id: string;
  code: string;
  status: GiftVoucherStatus;
  groupId: string;
  groupName: string;
  /** The group's Coupon Code Prefix. */
  codePrefix: string;
  startDate: string;
  endDate: string;
  orderNo: string | null;
  usedAt: string | null;
  phoneNo: string | null;
};

export type GiftVoucherCheck = {
  code: string;
  result: GiftVoucherCheckResult;
  groupName: string | null;
  startDate: string | null;
  endDate: string | null;
};

export function normalizeVoucherCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Split pasted text (one per line, or separated by commas, tabs or spaces as when copied
 * from Excel) into normalized codes, reporting invalid entries and in-list duplicates.
 */
export function parseVoucherCodeList(text: string): {
  codes: string[];
  invalid: string[];
  duplicates: string[];
} {
  const codes: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const code = normalizeVoucherCode(raw);
    if (!code) continue;
    if (!GIFT_VOUCHER_CODE_PATTERN.test(code)) {
      invalid.push(code);
    } else if (seen.has(code)) {
      if (!duplicates.includes(code)) duplicates.push(code);
    } else {
      seen.add(code);
      codes.push(code);
    }
  }
  return { codes, invalid, duplicates };
}

export function formatVoucherCode(groupNumber: number, randomPart: number): string {
  return `${GIFT_VOUCHER_CODE_BRAND}${String(groupNumber).padStart(GIFT_VOUCHER_GROUP_NUMBER_DIGITS, "0")}${String(randomPart).padStart(GIFT_VOUCHER_RANDOM_DIGITS, "0")}`;
}

/**
 * Pick `quantity` distinct random 5-digit parts for a group's codes, skipping any code in
 * `exclude`, and return them in ascending order. `randomInt(min, max)` is inclusive and is
 * injected so the server uses crypto.randomInt and tests can be deterministic.
 */
export function generateRandomVoucherCodes(input: {
  groupNumber: number;
  quantity: number;
  exclude: ReadonlySet<string>;
  randomInt: (min: number, max: number) => number;
}): { code: string; randomPart: number }[] | null {
  if (input.quantity > GIFT_VOUCHER_RANDOM_MAX + 1 - input.exclude.size) return null;

  const picked = new Set<number>();
  while (picked.size < input.quantity) {
    const n = input.randomInt(0, GIFT_VOUCHER_RANDOM_MAX);
    if (picked.has(n) || input.exclude.has(formatVoucherCode(input.groupNumber, n))) continue;
    picked.add(n);
  }
  return [...picked]
    .sort((a, b) => a - b)
    .map((n) => ({ code: formatVoucherCode(input.groupNumber, n), randomPart: n }));
}

/**
 * Derive a code's status. `today`, `startDate` and `endDate` are YYYY-MM-DD strings in
 * the app time zone, so plain string comparison orders them correctly.
 */
export function deriveGiftVoucherStatus(input: {
  used: boolean;
  startDate: string;
  endDate: string;
  today: string;
}): GiftVoucherStatus {
  if (input.used) return "USED";
  if (input.today < input.startDate) return "PENDING";
  if (input.today > input.endDate) return "EXPIRED";
  return "ACTIVE";
}

export function checkResultForStatus(status: GiftVoucherStatus): GiftVoucherCheckResult {
  switch (status) {
    case "USED":
      return "USED";
    case "EXPIRED":
      return "EXPIRED";
    case "PENDING":
      return "NOT_YET_ACTIVE";
    default:
      return "VALID";
  }
}

/** First word of a coupon, uppercased: "SGV 1000" -> "SGV". Matched against group prefixes. */
export function couponPrefix(coupon: string): string | null {
  const first = coupon.trim().split(/\s+/)[0];
  return first ? first.toUpperCase() : null;
}

export type OrderGiftVoucherApplied = {
  code: string;
  groupName: string;
  usedAt: string | null;
};

export type OrderGiftVoucherState = {
  /** Coupons on the order whose first word matches a voucher group prefix. */
  matchedCoupons: string[];
  /** Batch codes already applied to the order, oldest first. */
  applied: OrderGiftVoucherApplied[];
  canApply: boolean;
};
