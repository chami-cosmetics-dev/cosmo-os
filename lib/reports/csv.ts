export type CsvPrimitive = string | number | null | undefined;

export function escapeCsvCell(value: CsvPrimitive) {
  const normalized = value == null ? "" : String(value);
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function buildCsv<T extends Record<string, CsvPrimitive>>(
  headers: readonly string[],
  rows: T[]
) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function formatIsoDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export function formatIsoDateTime(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString();
}

export function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function getAddressField(address: unknown, field: string) {
  if (!address || typeof address !== "object") return "";
  const record = address as Record<string, unknown>;
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

export function getCustomerName(address: unknown) {
  const name = getAddressField(address, "name");
  if (name) return name;

  const first = getAddressField(address, "first_name");
  const last = getAddressField(address, "last_name");
  return [first, last].filter(Boolean).join(" ").trim();
}

export function formatAddress(address: unknown) {
  const parts = [
    getAddressField(address, "address1"),
    getAddressField(address, "address2"),
    [getAddressField(address, "city"), getAddressField(address, "province_code")].filter(Boolean).join(", "),
    getAddressField(address, "country"),
    getAddressField(address, "zip"),
  ].filter(Boolean);

  return parts.join(", ");
}
