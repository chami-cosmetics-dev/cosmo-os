import { canonicalPhoneForErpCustomerId, phoneDigitsOnly } from "@/lib/phone-lookup";
import { formatIsoDate, formatIsoDateTime } from "@/lib/reports/csv";

export type ContactIdentifierRow = {
  email: string | null;
  phoneNumber: string | null;
  emails?: { email: string }[];
  phones?: { phoneNumber: string }[];
};

export function dumpText(value: string | number | null | undefined) {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return "";
    return String(value);
  }
  return value.trim();
}

export function dumpYesNo(value: boolean | null | undefined) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "";
}

export function dumpDate(value: Date | null | undefined) {
  return formatIsoDate(value);
}

export function dumpDateTime(value: Date | null | undefined) {
  return formatIsoDateTime(value);
}

function normalizeAlias(value: string, mode: "email" | "phone") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (mode === "email") return trimmed.toLowerCase();
  return canonicalPhoneForErpCustomerId(trimmed) ?? phoneDigitsOnly(trimmed);
}

/** Primary first, then extra aliases joined with "; ". */
export function splitPrimaryAndExtra(
  primary: string | null | undefined,
  aliases: string[],
  mode: "email" | "phone"
) {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (raw: string | null | undefined) => {
    const trimmed = raw?.trim() ?? "";
    if (!trimmed) return;
    const key = normalizeAlias(trimmed, mode);
    if (!key || seen.has(key)) return;
    seen.add(key);
    ordered.push(trimmed);
  };

  push(primary);
  for (const alias of aliases) push(alias);

  return {
    primary: ordered[0] ?? "",
    extra: ordered.slice(1).join("; "),
  };
}

export function contactEmails(row: ContactIdentifierRow) {
  return splitPrimaryAndExtra(
    row.email,
    (row.emails ?? []).map((item) => item.email),
    "email"
  );
}

export function contactPhones(row: ContactIdentifierRow) {
  return splitPrimaryAndExtra(
    row.phoneNumber,
    (row.phones ?? []).map((item) => item.phoneNumber),
    "phone"
  );
}
