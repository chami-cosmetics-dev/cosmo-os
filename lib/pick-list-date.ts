import { formatAppDateShort, formatAppIsoDate } from "@/lib/format-datetime";

/** Start and end of the given calendar day (YYYY-MM-DD) in Sri Lanka time. Defaults to today. */
export function getPickListTodayBounds(dateStr?: string) {
  let resolved: string;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    resolved = dateStr;
  } else {
    resolved = formatAppIsoDate(new Date());
  }

  return {
    from: new Date(`${resolved}T00:00:00+05:30`),
    to: new Date(`${resolved}T23:59:59.999+05:30`),
    label: resolved,
  };
}

export function formatPickListTodayLabel(dateStr?: string) {
  const { label } = getPickListTodayBounds(dateStr);
  return formatAppDateShort(`${label}T12:00:00+05:30`, label);
}