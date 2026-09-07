/** Canonical call-outcome templates for Contact Updates + Call Center chart. */
export const CALL_CENTER_CATEGORY_VALUES = [
  "N/A",
  "Interested",
  "Not Interested",
  "Not Responding",
  "Wrong Number",
  "Black List",
  "Busy",
  "Interested-SMS",
] as const;

export type CallCenterCategory = (typeof CALL_CENTER_CATEGORY_VALUES)[number];

/** Colors aligned to the Call Center Performance Analysis legend. */
export const CALL_CENTER_CATEGORY_COLORS: Record<CallCenterCategory, string> = {
  "N/A": "#7dd3fc", // light blue
  Interested: "#4b5563", // dark gray
  "Not Interested": "#86efac", // light green
  "Not Responding": "#fb923c", // orange
  "Wrong Number": "#a855f7", // purple
  "Black List": "#f472b6", // pink
  Busy: "#eab308", // yellow
  "Interested-SMS": "#14b8a6", // teal
};

const FALLBACK_COLORS = [
  "#6366f1",
  "#3b82f6",
  "#f59e0b",
  "#d946ef",
  "#84cc16",
  "#64748b",
];

/** Chart-only series (not a call-outcome dropdown). Loyalty outreach logs this. */
export const CALL_CENTER_CONTACTED_CATEGORY = "Contacted";

const CHART_ONLY_CATEGORY_COLORS: Record<string, string> = {
  [CALL_CENTER_CONTACTED_CATEGORY]: "#38bdf8",
};

/** Bulk assign noise only — loyalty `Contacted` counts as a call (same as GM). */
export const CALL_CENTER_CHART_EXCLUDED_CATEGORIES = new Set(["allocation"]);

export function isCallCenterCategory(value: string): value is CallCenterCategory {
  return (CALL_CENTER_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function callCenterCategoryColor(category: string, index = 0): string {
  if (isCallCenterCategory(category)) {
    return CALL_CENTER_CATEGORY_COLORS[category];
  }
  const chartOnly = CHART_ONLY_CATEGORY_COLORS[category];
  if (chartOnly) return chartOnly;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]!;
}

/** Stable legend/series order: template first, Contacted, then extras A–Z. */
export function sortCallCenterCategories(categories: string[]): string[] {
  const rank = new Map(
    [...CALL_CENTER_CATEGORY_VALUES, CALL_CENTER_CONTACTED_CATEGORY].map(
      (value, i) => [value.toLowerCase(), i],
    ),
  );
  return [...categories].sort((a, b) => {
    const ai = rank.get(a.trim().toLowerCase());
    const bi = rank.get(b.trim().toLowerCase());
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b);
  });
}
