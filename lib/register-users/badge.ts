import { formatAppIsoDate } from "@/lib/format-datetime";

export type OsRegBadgeDto = { location: string };

export function isOsRegBadgeActive(
  start: Date | null | undefined,
  end: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!start || !end) return false;
  const today = formatAppIsoDate(now);
  const startDay = formatAppIsoDate(start);
  const endDay = formatAppIsoDate(end);
  if (!today || !startDay || !endDay) return false;
  return today >= startDay && today <= endDay;
}

export function osRegBadgeDto(
  location: string | null | undefined,
  start: Date | null | undefined,
  end: Date | null | undefined,
  now = new Date(),
): OsRegBadgeDto | null {
  const loc = location?.trim();
  if (!loc || !isOsRegBadgeActive(start, end, now)) return null;
  return { location: loc };
}
