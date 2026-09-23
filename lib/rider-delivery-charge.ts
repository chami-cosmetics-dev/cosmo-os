import { Prisma } from "@prisma/client";

import { resolveOrderShippingDisplay } from "@/lib/order-shipping-display";

/** Normalize shipping rule labels for lookup (case/spacing insensitive). */
export function normalizeShippingRuleLabelKey(label: string | null | undefined): string {
  return (label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    // "Colombo2" / "colombo10" → "colombo 2" / "colombo 10"
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ");
}

/** True when label key is Zone A / Zone B style (Shopify zone shipping). */
export function isZoneShippingLabelKey(labelKey: string | null | undefined): boolean {
  return Boolean(labelKey && /^zone\b/.test(labelKey));
}

/** Pick up / free-ship / staff DC — completed delivery but no rider delivery incentive. */
export function isExcludedFromRiderIncentiveLabel(label: string | null | undefined): boolean {
  const key = normalizeShippingRuleLabelKey(label);
  if (!key) return false;
  if (key === "pick up" || key === "pickup") return true;
  if (key === "freeship" || key === "free ship") return true;
  if (key === "staffdc") return true;
  return false;
}

/** ERP generic label — resolve pay from shipping address city instead. */
export function shouldUseCityFallbackForIncentiveLabel(
  shippingRuleLabel: string | null | undefined
): boolean {
  const key = normalizeShippingRuleLabelKey(shippingRuleLabel);
  return key === "delivery";
}

const NON_DISTRICT_CITY_KEYS = new Set(["sri lanka", "lanka"]);

export function isUsableShippingCityForCharge(city: string | null | undefined): boolean {
  const key = normalizeShippingRuleLabelKey(city);
  if (!key || key.length < 2) return false;
  return !NON_DISTRICT_CITY_KEYS.has(key);
}

function matchIncentiveViaShippingCity(
  shippingCity: string | null | undefined,
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>
): { amount: Prisma.Decimal; matched: boolean; labelKey: string | null } | null {
  if (!isUsableShippingCityForCharge(shippingCity)) return null;
  const cityKeys = shippingRuleLabelLookupKeys(shippingCity);
  return matchChargeForKeys(cityKeys, chargeByLabelKey);
}

export function riderIncentiveMatchDisplayLabel(label: string | null | undefined): string {
  const trimmed = (label ?? "").trim();
  return trimmed || "(no shipping label)";
}

/**
 * Lookup candidates for an order shipping label.
 * Exact key first, then peel trailing " - …" segments so "Colombo 2 - DTD" → "colombo 2".
 * Sheet keys stay as uploaded; peeling is match-time only.
 */
export function shippingRuleLabelLookupKeys(label: string | null | undefined): string[] {
  const key = normalizeShippingRuleLabelKey(label);
  if (!key) return [];
  const keys: string[] = [key];
  let current = key;
  while (true) {
    const idx = current.lastIndexOf(" - ");
    if (idx <= 0) break;
    current = current.slice(0, idx).trim();
    if (!current || keys.includes(current)) break;
    keys.push(current);
  }
  return keys;
}

export function resolveOrderShippingRuleLabel(order: {
  totalShipping?: string | number | { toString(): string } | null;
  shippingLines?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
  discountCodes?: unknown;
}): string | null {
  return resolveOrderShippingDisplay({
    ...order,
    totalShipping:
      order.totalShipping == null ? null : order.totalShipping.toString(),
  }).label;
}

function cityFromAddressLike(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const city = (value as Record<string, unknown>).city;
  if (typeof city !== "string") return null;
  const trimmed = city.trim();
  return trimmed || null;
}

/** Order shipping city for Zone A/B → district charge lookup. */
export function extractOrderShippingCity(order: {
  shippingAddress?: unknown;
  rawPayload?: unknown;
}): string | null {
  const fromAddress = cityFromAddressLike(order.shippingAddress);
  if (fromAddress) return fromAddress;

  const raw = order.rawPayload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;
  return (
    cityFromAddressLike(payload.shipping_address) ??
    cityFromAddressLike(payload.shippingAddress)
  );
}

export function riderDeliveryChargeAmount(
  charge: Prisma.Decimal | number | string | null | undefined
): Prisma.Decimal {
  if (charge == null) return new Prisma.Decimal(0);
  const value = new Prisma.Decimal(charge.toString());
  return value.gt(0) ? value : new Prisma.Decimal(0);
}

function matchChargeForKeys(
  keys: string[],
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>
): { amount: Prisma.Decimal; matched: boolean; labelKey: string | null } | null {
  for (const key of keys) {
    const charge = chargeByLabelKey.get(key);
    if (charge == null) continue;
    return {
      amount: riderDeliveryChargeAmount(charge),
      matched: true,
      labelKey: key,
    };
  }
  return null;
}

/** Resolve rider incentive from uploaded rule table; unmatched labels → 0. */
export function resolveRiderIncentiveFromRules(input: {
  shippingRuleLabel: string | null | undefined;
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>;
  shippingCity?: string | null;
  zoneMembersByZone?: Map<string, Set<string>>;
  manualIncentiveLabelKey?: string | null;
}): Prisma.Decimal {
  return resolveRiderIncentiveMatch(input).amount;
}

/**
 * Resolve rider incentive.
 * 1) Excluded labels (Pick Up / FREESHIP / STAFFDC) → no pay.
 * 2) Staff manual district key → charge sheet.
 * 3) Label lookup keys against charge sheet (DTD peel included).
 * 4) Zone A/B → shipping city → charge sheet (zone membership when loaded).
 * 5) Generic ERP "Delivery" or missing label → shipping city → charge sheet.
 */
export function resolveRiderIncentiveMatch(input: {
  shippingRuleLabel: string | null | undefined;
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>;
  shippingCity?: string | null;
  zoneMembersByZone?: Map<string, Set<string>>;
  manualIncentiveLabelKey?: string | null;
}): {
  amount: Prisma.Decimal;
  matched: boolean;
  labelKey: string | null;
  excludedFromIncentive?: boolean;
  manualOverride?: boolean;
} {
  if (isExcludedFromRiderIncentiveLabel(input.shippingRuleLabel)) {
    return {
      amount: new Prisma.Decimal(0),
      matched: true,
      labelKey: normalizeShippingRuleLabelKey(input.shippingRuleLabel),
      excludedFromIncentive: true,
    };
  }

  const manualKey = normalizeShippingRuleLabelKey(input.manualIncentiveLabelKey);
  if (manualKey) {
    const manual = matchChargeForKeys([manualKey], input.chargeByLabelKey);
    if (manual) {
      return { ...manual, manualOverride: true };
    }
    return {
      amount: new Prisma.Decimal(0),
      matched: false,
      labelKey: manualKey,
      manualOverride: true,
    };
  }

  const keys = shippingRuleLabelLookupKeys(input.shippingRuleLabel);

  if (keys.length > 0) {
    const direct = matchChargeForKeys(keys, input.chargeByLabelKey);
    if (direct) return direct;

    const zoneKey = keys.find((k) => isZoneShippingLabelKey(k));
    if (zoneKey) {
      const cityKeys = shippingRuleLabelLookupKeys(input.shippingCity);
      if (cityKeys.length === 0) {
        return {
          amount: new Prisma.Decimal(0),
          matched: false,
          labelKey: zoneKey,
        };
      }

      const members = input.zoneMembersByZone?.get(zoneKey);
      if (members && members.size > 0) {
        const preferred = cityKeys.filter((k) => members.has(k));
        const preferredMatch = matchChargeForKeys(preferred, input.chargeByLabelKey);
        if (preferredMatch) return preferredMatch;
      }

      const cityMatch = matchChargeForKeys(cityKeys, input.chargeByLabelKey);
      if (cityMatch) return cityMatch;

      return {
        amount: new Prisma.Decimal(0),
        matched: false,
        labelKey: cityKeys[0] ?? zoneKey,
      };
    }

    if (shouldUseCityFallbackForIncentiveLabel(input.shippingRuleLabel)) {
      const viaCity = matchIncentiveViaShippingCity(
        input.shippingCity,
        input.chargeByLabelKey
      );
      if (viaCity) return viaCity;
    }

    return {
      amount: new Prisma.Decimal(0),
      matched: false,
      labelKey: keys[0] ?? null,
    };
  }

  const viaCity = matchIncentiveViaShippingCity(input.shippingCity, input.chargeByLabelKey);
  if (viaCity) return viaCity;

  return { amount: new Prisma.Decimal(0), matched: false, labelKey: null };
}

export type RiderDistrictChargeOption = {
  labelKey: string;
  label: string;
  riderDeliveryCharge: string;
};

/** Rank charge-sheet districts that appear in address/city text (top N). */
export function suggestRiderDistrictsFromAddress(input: {
  addressText?: string | null;
  city?: string | null;
  options: RiderDistrictChargeOption[];
  limit?: number;
}): RiderDistrictChargeOption[] {
  const haystack = normalizeShippingRuleLabelKey(
    [input.city, input.addressText].filter(Boolean).join(" ")
  );
  if (!haystack || input.options.length === 0) return [];

  const scored: Array<{ option: RiderDistrictChargeOption; score: number }> = [];
  for (const option of input.options) {
    const key = normalizeShippingRuleLabelKey(option.labelKey || option.label);
    if (!key || key.length < 3) continue;
    let score = 0;
    if (haystack === key) score = 100;
    else if (haystack.includes(key)) score = 80 + Math.min(key.length, 20);
    else if (key.includes(haystack) && haystack.length >= 4) score = 40;
    else {
      const tokens = key.split(" ").filter((t) => t.length >= 4);
      const hit = tokens.filter((t) => haystack.includes(t)).length;
      if (hit > 0) score = 20 + hit * 10;
    }
    if (score > 0) scored.push({ option, score });
  }

  scored.sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label));
  const limit = input.limit ?? 5;
  return scored.slice(0, limit).map((row) => row.option);
}

export type ParsedRiderDeliveryChargeRow = {
  label: string;
  labelKey: string;
  district: string | null;
  shippingAmount: string;
  riderDeliveryCharge: string;
  shippingAccount: string | null;
  costCenter: string | null;
};

export type ParsedRiderDeliveryZoneMember = {
  zoneKey: string;
  zoneLabel: string;
  districtLabelKey: string;
  districtLabel: string;
};

function cellString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function cellMoney(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

export type ParsedRiderDeliveryChargeSheet = {
  rows: ParsedRiderDeliveryChargeRow[];
  errors: string[];
  skippedBlank: number;
  format: "shipping-rule" | null;
};

export type ParsedRiderDeliveryZoneMemberSheet = {
  rows: ParsedRiderDeliveryZoneMember[];
  errors: string[];
  skippedBlank: number;
  format: "final-working" | "zones" | null;
};

function headerCells(rows: unknown[][]): string[] {
  return (rows[0] ?? []).map((c) => cellString(c).toLowerCase());
}

function findHeaderCol(header: string[], ...needles: string[]) {
  return header.findIndex((h) => needles.some((n) => h.includes(n)));
}

/**
 * Parse Zone Name → City membership from Final Working (ignore Amount / Delivery Person Charges).
 */
export function parseRiderDeliveryZoneMembers(
  rows: unknown[][]
): ParsedRiderDeliveryZoneMemberSheet {
  const errors: string[] = [];
  let skippedBlank = 0;
  if (rows.length < 2) {
    return { rows: [], errors: ["Sheet has no data rows"], skippedBlank: 0, format: null };
  }

  const header = headerCells(rows);
  const zoneCol = findHeaderCol(header, "zone name", "zone");
  const cityCol = findHeaderCol(header, "city name", "town/city", "city");

  if (cityCol < 0 || zoneCol < 0) {
    return {
      rows: [],
      errors: ["Missing zone membership columns. Need Zone Name and City Name."],
      skippedBlank: 0,
      format: null,
    };
  }

  const byPair = new Map<string, ParsedRiderDeliveryZoneMember>();
  let lastZoneLabel = "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const zoneRaw = cellString(row[zoneCol]);
    const city = cellString(row[cityCol]);
    if (zoneRaw) lastZoneLabel = zoneRaw;
    const zoneLabel = zoneRaw || lastZoneLabel;
    if (!zoneLabel && !city) {
      skippedBlank += 1;
      continue;
    }
    if (!zoneLabel || !city) {
      skippedBlank += 1;
      continue;
    }

    const zoneKey = normalizeShippingRuleLabelKey(zoneLabel);
    const districtLabelKey = normalizeShippingRuleLabelKey(city);
    if (!zoneKey || !districtLabelKey) {
      skippedBlank += 1;
      continue;
    }

    byPair.set(`${zoneKey}::${districtLabelKey}`, {
      zoneKey,
      zoneLabel,
      districtLabelKey,
      districtLabel: city,
    });
  }

  const looksFinalWorking =
    findHeaderCol(header, "city name") >= 0 || findHeaderCol(header, "delivery person") >= 0;

  return {
    rows: Array.from(byPair.values()),
    errors,
    skippedBlank,
    format: byPair.size > 0 ? (looksFinalWorking ? "final-working" : "zones") : null,
  };
}

/**
 * Prefer Final Working sheet for zone→city membership; also accept a "zones" sheet
 * (Zone + Town/City, forward-fill Zone, ignore Amount).
 */
export function parseRiderDeliveryZoneMembersFromWorkbookSheets(
  sheets: Array<{ name: string; rows: unknown[][] }>
): ParsedRiderDeliveryZoneMemberSheet & { sheetName: string | null } {
  const preferred = sheets.filter((s) => {
    const n = s.name.trim().toLowerCase();
    return n.includes("final working") || n === "zones" || n.includes("zone");
  });
  const ordered = [
    ...preferred.filter((s) => s.name.trim().toLowerCase().includes("final working")),
    ...preferred.filter((s) => !s.name.trim().toLowerCase().includes("final working")),
    ...sheets.filter((s) => !preferred.includes(s)),
  ];

  let lastEmpty: ParsedRiderDeliveryZoneMemberSheet & { sheetName: string | null } = {
    rows: [],
    errors: ["No valid zone-membership sheet found"],
    skippedBlank: 0,
    format: null,
    sheetName: null,
  };

  for (const sheet of ordered) {
    const parsed = parseRiderDeliveryZoneMembers(sheet.rows);
    if (parsed.rows.length > 0) {
      return { ...parsed, sheetName: sheet.name };
    }
    lastEmpty = { ...parsed, sheetName: sheet.name };
  }
  return lastEmpty;
}

/**
 * Parse "Shipping Rule New.xlsx" style sheets.
 * Expected headers (row 1): Shipping Rule Label, District, Shipping Account, Cost Center,
 * Shipping Amount, Delivery Charges for riders
 */
export function parseRiderDeliveryChargeSheetRows(
  rows: unknown[][]
): ParsedRiderDeliveryChargeSheet {
  const errors: string[] = [];
  let skippedBlank = 0;
  if (rows.length < 2) {
    return { rows: [], errors: ["Sheet has no data rows"], skippedBlank: 0, format: null };
  }

  const header = headerCells(rows);
  const labelCol = findHeaderCol(header, "shipping rule label", "rule label");
  const districtCol = findHeaderCol(header, "district");
  const accountCol = findHeaderCol(header, "shipping account");
  const costCol = findHeaderCol(header, "cost center", "cost centre");
  const shippingAmtCol = findHeaderCol(header, "shipping amount");
  const riderCol = findHeaderCol(header, "delivery charges for riders");

  if (labelCol < 0 || shippingAmtCol < 0 || riderCol < 0) {
    return {
      rows: [],
      errors: [
        "Missing required columns. Need Shipping Rule Label, Shipping Amount, and Delivery Charges for riders.",
      ],
      skippedBlank: 0,
      format: null,
    };
  }

  const byKey = new Map<string, ParsedRiderDeliveryChargeRow>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = cellString(row[labelCol]);
    if (!label) continue;
    const shippingAmount = cellMoney(row[shippingAmtCol]);
    const riderRaw = row[riderCol];
    const riderBlank = riderRaw == null || String(riderRaw).trim() === "";
    if (riderBlank) {
      skippedBlank += 1;
      continue;
    }
    const riderDeliveryCharge = cellMoney(riderRaw);
    if (shippingAmount == null || riderDeliveryCharge == null) {
      errors.push(`Row ${i + 1} (${label}): invalid shipping/rider amounts`);
      continue;
    }
    const labelKey = normalizeShippingRuleLabelKey(label);
    byKey.set(labelKey, {
      label,
      labelKey,
      district: districtCol >= 0 ? cellString(row[districtCol]) || null : null,
      shippingAmount,
      riderDeliveryCharge,
      shippingAccount: accountCol >= 0 ? cellString(row[accountCol]) || null : null,
      costCenter: costCol >= 0 ? cellString(row[costCol]) || null : null,
    });
  }

  return {
    rows: Array.from(byKey.values()),
    errors,
    skippedBlank,
    format: byKey.size > 0 ? "shipping-rule" : null,
  };
}

/**
 * Prefer sheets named like Final (2) / shipping-rule format.
 * Do NOT import charges from Final Working.
 */
export function parseRiderDeliveryChargesFromWorkbookSheets(
  sheets: Array<{ name: string; rows: unknown[][] }>
): ParsedRiderDeliveryChargeSheet & { sheetName: string | null } {
  const preferred = sheets.filter((s) => {
    const n = s.name.trim().toLowerCase();
    return (
      n.includes("final (2)") ||
      n.includes("final(2)") ||
      n.includes("shipping rule") ||
      n === "final 2"
    );
  });
  const ordered = [...preferred, ...sheets.filter((s) => !preferred.includes(s))];

  let lastEmpty: ParsedRiderDeliveryChargeSheet & { sheetName: string | null } = {
    rows: [],
    errors: ["No valid shipping-rule charge sheet found"],
    skippedBlank: 0,
    format: null,
    sheetName: null,
  };

  for (const sheet of ordered) {
    const nameLower = sheet.name.trim().toLowerCase();
    if (nameLower.includes("final working")) continue;

    const parsed = parseRiderDeliveryChargeSheetRows(sheet.rows);
    if (parsed.rows.length > 0) {
      return { ...parsed, sheetName: sheet.name };
    }
    lastEmpty = { ...parsed, sheetName: sheet.name };
  }
  return lastEmpty;
}
