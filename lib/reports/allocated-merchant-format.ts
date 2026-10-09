import { normalizeMerCodeKey } from "@/lib/merchant-allocation";

export type AllocatedMerchantRosterMatch = {
  value: string;
  label: string;
};

function merCodeInText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const leading = normalizeMerCodeKey(trimmed);
  if (leading && /^MER\s*\d+$/i.test(trimmed)) return leading;
  const embedded = trimmed.match(/\bMER\s*(\d+)\b/i);
  return embedded ? `MER${embedded[1]}` : null;
}

function stripMerSuffix(name: string, mer: string): string {
  const pattern = new RegExp(`\\s*\\([^)]*${mer}[^)]*\\)\\s*$`, "i");
  return name.replace(pattern, "").trim();
}

function nameAfterMerCoupon(text: string, mer: string): string | null {
  const match = text.trim().match(/^MER\s*(\d+)\s*[-–]\s*(.+)$/i);
  if (!match || `MER${match[1]}` !== mer) return null;
  const name = match[2].trim();
  return name || null;
}

/** One dropdown row per roster merchant: `Sandali(MER91)`. */
export function formatTransferMerchantOptions(
  roster: Array<{ value: string; label: string }>
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ value: string; label: string }> = [];
  for (const option of roster) {
    const value = option.value.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = formatAllocatedMerchantExport(option.label, value) || value;
    out.push({ value, label });
  }
  out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
  return out;
}

/** `Sandali(MER91)`. Name only, or MER only, when the other half is missing. */
export function formatAllocatedMerchantExport(
  label: string | null | undefined,
  value: string | null | undefined
): string {
  const rawLabel = (label ?? "").trim();
  const rawValue = (value ?? "").trim();
  if (!rawLabel && !rawValue) return "";

  const mer = merCodeInText(rawValue) ?? merCodeInText(rawLabel);
  if (!mer) return rawLabel || rawValue;

  let name = rawLabel;
  if (merCodeInText(name) === mer && /^MER\s*\d+$/i.test(name)) {
    name =
      rawValue && merCodeInText(rawValue) !== mer ? rawValue : "";
  }
  name = stripMerSuffix(name, mer);
  name = nameAfterMerCoupon(name, mer) ?? name;
  if (!name || name.toLowerCase() === mer.toLowerCase()) return mer;
  return `${name}(${mer})`;
}

/** Resolve a stored assignedMerchant label through the roster, then format `name(MER)`. */
export function formatStoredAllocatedMerchant(
  raw: string | null | undefined,
  aliasToRoster?: Map<string, AllocatedMerchantRosterMatch> | null
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  const lookup = (key: string) => aliasToRoster?.get(key.trim().toLowerCase());
  const direct = lookup(trimmed);
  if (direct) return formatAllocatedMerchantExport(direct.label, direct.value);

  const mer = merCodeInText(trimmed);
  if (mer) {
    const byMer = lookup(mer);
    if (byMer) return formatAllocatedMerchantExport(byMer.label, byMer.value);
  }

  const beforeParen = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (beforeParen && beforeParen !== trimmed) {
    const byName = lookup(beforeParen);
    if (byName) return formatAllocatedMerchantExport(byName.label, byName.value);
  }

  const byPrefix = matchRosterByLeadingName(trimmed, aliasToRoster);
  if (byPrefix) return formatAllocatedMerchantExport(byPrefix.label, byPrefix.value);

  return formatAllocatedMerchantExport(trimmed, trimmed);
}

function rosterDisplayName(match: AllocatedMerchantRosterMatch): string {
  const mer = merCodeInText(match.value) ?? merCodeInText(match.label);
  const label = match.label.trim();
  if (!mer) return label;
  return stripMerSuffix(label, mer) || label;
}

/** "Dulshi Fernando" → roster display "Dulshi", when the extra words are not their own merchant. */
function matchRosterByLeadingName(
  raw: string,
  aliasToRoster?: Map<string, AllocatedMerchantRosterMatch> | null
): AllocatedMerchantRosterMatch | null {
  if (!aliasToRoster || aliasToRoster.size === 0) return null;
  const needle = raw.trim().toLowerCase();
  if (needle.length < 3) return null;

  const seen = new Set<string>();
  let best: { match: AllocatedMerchantRosterMatch; length: number } | null = null;
  for (const match of aliasToRoster.values()) {
    const id = match.value.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const display = rosterDisplayName(match).trim().toLowerCase();
    if (display.length < 3) continue;
    if (!needle.startsWith(`${display} `)) continue;
    if (!best || display.length > best.length) best = { match, length: display.length };
  }
  return best?.match ?? null;
}
