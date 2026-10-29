/**
 * Priority label colours (Stock Trends, Sales Budget). Avoids red/amber/green (Current stock) and
 * blue/grey/purple (Movement). Known priorities are pinned; any new ERP value
 * gets a stable colour from the rest of the palette by hashing its name.
 */
// Strong fill + ring + high-contrast text so each label reads clearly in both themes.
const PRIORITY_LABEL_PALETTE = [
  "bg-pink-500/25 text-pink-800 ring-pink-500/60 dark:bg-pink-400/25 dark:text-pink-100",
  "bg-cyan-500/25 text-cyan-800 ring-cyan-500/60 dark:bg-cyan-400/25 dark:text-cyan-100",
  "bg-orange-500/25 text-orange-800 ring-orange-500/60 dark:bg-orange-400/25 dark:text-orange-100",
  "bg-indigo-500/25 text-indigo-800 ring-indigo-500/60 dark:bg-indigo-400/30 dark:text-indigo-100",
  "bg-fuchsia-500/25 text-fuchsia-800 ring-fuchsia-500/60 dark:bg-fuchsia-400/25 dark:text-fuchsia-100",
  "bg-teal-500/25 text-teal-800 ring-teal-500/60 dark:bg-teal-400/25 dark:text-teal-100",
];

/**
 * Known priorities get their own palette slot (matched loosely, since ERP
 * spellings vary — "Discontinue"/"Discontinued", "New"/"Newly Added").
 */
const PRIORITY_LABEL_PINNED: { matches: (key: string) => boolean; slot: number }[] = [
  { matches: (k) => k === "top", slot: 0 },
  { matches: (k) => k === "low", slot: 1 },
  { matches: (k) => k.startsWith("discontinu"), slot: 2 },
  { matches: (k) => k.startsWith("new"), slot: 3 },
];

export function priorityLabelClass(priority: string): string {
  const key = priority.trim().toLowerCase();
  const pinned = PRIORITY_LABEL_PINNED.find((p) => p.matches(key));
  if (pinned) return PRIORITY_LABEL_PALETTE[pinned.slot];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  // Unknown priorities only use the unpinned slots, so they never look like a known one.
  const firstFree = PRIORITY_LABEL_PINNED.length;
  return PRIORITY_LABEL_PALETTE[firstFree + (hash % (PRIORITY_LABEL_PALETTE.length - firstFree))];
}
