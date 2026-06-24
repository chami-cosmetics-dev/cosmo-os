const PICK_LIST_TIMEZONE = "Asia/Colombo";

/** Start and end of the current calendar day in Sri Lanka (for pick list filters). */
export function getPickListTodayBounds(now = new Date()) {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: PICK_LIST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return {
    from: new Date(`${dateStr}T00:00:00+05:30`),
    to: new Date(`${dateStr}T23:59:59.999+05:30`),
    label: dateStr,
  };
}

export function formatPickListTodayLabel() {
  const { label } = getPickListTodayBounds();
  const [y, m, d] = label.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: PICK_LIST_TIMEZONE,
  });
}
