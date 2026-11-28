/**
 * Search Console "Pages" export (Performance → Pages → Export → Excel) for the Shopify Draft tab:
 * URL → product handle, merged per handle. Pure, client-safe.
 */

/** Filters the export must use (shown as a hint; an upload with any other is rejected). */
export const EXPECTED_SEARCH_CONSOLE_FILTERS = [
  { name: "Date", expected: "Last 3 months", matches: (v: string) => /3\s*months?/i.test(v) },
  { name: "Search type", expected: "Web", matches: (v: string) => /^web\b/i.test(v.trim()) },
  { name: "Page", expected: "contains /products", matches: (v: string) => /\/products/i.test(v) },
  { name: "Country", expected: "Sri Lanka", matches: (v: string) => /sri\s*lanka/i.test(v) },
] as const;

/** Search Console's export lists at most this many pages. */
export const SEARCH_CONSOLE_PAGE_LIMIT = 1000;

const REQUIRED_COLUMNS = ["Top pages", "Clicks", "Impressions", "Position"] as const;

/**
 * Product handle from a "Top pages" URL, or null when it is not a cosmetics.lk product page:
 * drop the https://cosmetics.lk/products/ front, cut at ? or #, drop trailing /, decode, lowercase.
 */
export function handleFromUrl(url: unknown): string | null {
  const m = /^https?:\/\/(?:www\.)?cosmetics\.lk\/products\/([^?#]*)/i.exec(String(url ?? "").trim());
  if (!m) return null;
  let path = m[1].replace(/\/+$/, "");
  // A handle is one path segment; anything after a further "/" is not part of it.
  path = path.split("/")[0] ?? "";
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed %-escape: keep it as written.
  }
  const handle = path.trim().toLowerCase();
  return handle || null;
}

/** [clicks, impressions, Σ(impressions × position)] per handle. */
export type HandleMetricsTuple = [number, number, number];

export type MergedMetrics = { clicks: number; impressions: number; ctr: number; avgPosition: number };

/** CTR = clicks ÷ impressions; position weighted by impressions. Zeros when nothing matched. */
export function mergedMetricsOf(tuple: HandleMetricsTuple | undefined): MergedMetrics {
  const [clicks, impressions, weighted] = tuple ?? [0, 0, 0];
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? weighted / impressions : 0,
  };
}

export type ParsedSearchConsoleReport = {
  pagesRead: number;
  productRows: number;
  skippedRows: number;
  metrics: Record<string, HandleMetricsTuple>;
  filters: Record<string, string>;
  warnings: string[];
};

export type ParseResult = { ok: true; report: ParsedSearchConsoleReport } | { ok: false; error: string };

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return null;
  const n = Number(text.endsWith("%") ? text.slice(0, -1) : text);
  return Number.isFinite(n) ? n : null;
}

/**
 * `sheets`: each sheet as rows of cells (first row = headers). Uses the sheet that has a
 * "Top pages" header (the "Pages" sheet in a normal export); the file is rejected when it or
 * Clicks / Impressions / Position is missing. Runs only after the date and report checks
 * (search-console-checks); the Filters sheet is just recorded here.
 */
export function parseSearchConsoleSheets(sheets: Record<string, unknown[][]>): ParseResult {
  const names = Object.keys(sheets);
  const pagesName =
    names.find((name) => norm(name) === "pages" && (sheets[name][0] ?? []).some((c) => norm(c) === "top pages")) ??
    names.find((name) => (sheets[name][0] ?? []).some((c) => norm(c) === "top pages"));
  if (!pagesName) {
    return {
      ok: false,
      error:
        `No sheet with a "Top pages" column. Sheets found: ${names.join(", ") || "none"}. ` +
        "Upload the Search Console Performance export (Pages) as Excel.",
    };
  }

  const [header = [], ...body] = sheets[pagesName];
  const col = (name: string) => header.findIndex((c) => norm(c) === norm(name));
  const missing = REQUIRED_COLUMNS.filter((name) => col(name) === -1);
  if (missing.length > 0) {
    return {
      ok: false,
      error:
        `The "${pagesName}" sheet is missing: ${missing.join(", ")}. ` +
        `Columns found: ${header.map((c) => String(c ?? "")).filter(Boolean).join(", ") || "none"}.`,
    };
  }
  const [urlCol, clicksCol, imprCol, posCol] = REQUIRED_COLUMNS.map(col);

  const metrics: Record<string, HandleMetricsTuple> = {};
  let pagesRead = 0;
  let productRows = 0;
  let skippedRows = 0;
  for (const row of body) {
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    pagesRead += 1;
    const handle = handleFromUrl(row[urlCol]);
    const clicks = toNumber(row[clicksCol]);
    const impressions = toNumber(row[imprCol]);
    const position = toNumber(row[posCol]);
    if (!handle || clicks == null || impressions == null || position == null) {
      skippedRows += 1;
      continue;
    }
    productRows += 1;
    const current = metrics[handle] ?? [0, 0, 0];
    metrics[handle] = [current[0] + clicks, current[1] + impressions, current[2] + impressions * position];
  }
  if (productRows === 0) {
    return { ok: false, error: `The "${pagesName}" sheet has no cosmetics.lk/products URLs with numbers.` };
  }

  const filters: Record<string, string> = {};
  const filtersName = names.find((name) => norm(name) === "filters");
  for (const row of filtersName ? sheets[filtersName].slice(1) : []) {
    const name = String(row?.[0] ?? "").trim();
    if (name) filters[name] = String(row?.[1] ?? "").trim();
  }

  // The filters themselves are checked (and must match) before this, in checkReportContents.
  const warnings: string[] = [];
  if (pagesRead >= SEARCH_CONSOLE_PAGE_LIMIT) {
    warnings.push(
      `Search Console exports at most ${SEARCH_CONSOLE_PAGE_LIMIT} pages and this file is at that limit, ` +
        `so products outside the top ${SEARCH_CONSOLE_PAGE_LIMIT} show 0.`,
    );
  }

  return { ok: true, report: { pagesRead, productRows, skippedRows, metrics, filters, warnings } };
}
