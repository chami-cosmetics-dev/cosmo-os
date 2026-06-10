import { APP_TIME_ZONE } from "@/src/constants/app";

function getZonedDateParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;
  return { year, month, day, key: `${year}-${month}-${day}` };
}

export function getCompletedDateKey(value: string | null | undefined) {
  if (!value) return "unknown";
  const parts = getZonedDateParts(value);
  return parts?.key ?? "unknown";
}

export function formatCompletedSectionLabel(value: string | null | undefined) {
  if (!value) return "Recent";
  const date = new Date(value);
  const targetParts = getZonedDateParts(date);
  const todayParts = getZonedDateParts(new Date());
  if (!targetParts || !todayParts) return "Recent";

  const todayStart = new Date(`${todayParts.key}T00:00:00`);
  const targetStart = new Date(`${targetParts.key}T00:00:00`);
  const diffDays = Math.round((todayStart.getTime() - targetStart.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: APP_TIME_ZONE }).toUpperCase()}`;
  }

  return date
    .toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: APP_TIME_ZONE })
    .toUpperCase();
}

export function formatCompletedTime(value: string | null | undefined) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIME_ZONE,
  });
}

export function formatCompletedDateChipLabel(value: string | null) {
  if (!value) return "All dates";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "All dates";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

export function groupByCompletedDate<T extends { completedAt?: string | null }>(items: T[]) {
  const sections = new Map<string, T[]>();

  for (const item of items) {
    const key = getCompletedDateKey(item.completedAt);
    const label = formatCompletedSectionLabel(item.completedAt);
    const sectionKey = `${key}::${label}`;
    const bucket = sections.get(sectionKey) ?? [];
    bucket.push(item);
    sections.set(sectionKey, bucket);
  }

  return Array.from(sections.entries()).map(([sectionKey, sectionItems]) => {
    const label = sectionKey.split("::").slice(1).join("::");
    return { title: label, items: sectionItems };
  });
}

export function getUniqueDateKeys(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => getCompletedDateKey(value)).filter((key) => key !== "unknown"))).sort(
    (a, b) => b.localeCompare(a)
  );
}

export function isTodayDateKey(value: string | null | undefined) {
  return getCompletedDateKey(value) === getCompletedDateKey(new Date().toISOString());
}
