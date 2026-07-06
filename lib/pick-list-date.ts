const PICK_LIST_TIMEZONE = "Asia/Colombo";

/** Start and end of the given calendar day (YYYY-MM-DD) in Sri Lanka time. Defaults to today. */
export function getPickListTodayBounds(dateStr?: string) {
  let resolved: string;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    resolved = dateStr;
  } else {
    resolved = new Intl.DateTimeFormat("en-CA", {
      timeZone: PICK_LIST_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  return {
    from: new Date(`${resolved}T00:00:00+05:30`),
    to: new Date(`${resolved}T23:59:59.999+05:30`),
    label: resolved,
  };
}

export function formatPickListTodayLabel(dateStr?: string) {
  const { label } = getPickListTodayBounds(dateStr);
  const [y, m, d] = label.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: PICK_LIST_TIMEZONE,
  });
}
