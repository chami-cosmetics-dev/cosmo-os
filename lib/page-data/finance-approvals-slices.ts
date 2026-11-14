export const FINANCE_APPROVALS_HISTORY_LIMIT = 50;
export const FINANCE_APPROVALS_HISTORY_SEARCH_LIMIT = 200;

export function mergeFinanceApprovalSlices<T>(pending: T[], history: T[]): T[] {
  return [...pending, ...history];
}

/** Strip LIKE wildcards so search is literal order-number text. */
export function financeApprovalLikePattern(raw: string): string | null {
  const q = raw.trim().replace(/[%_]+/g, "").trim();
  if (!q) return null;
  return `%${q}%`;
}

export function mergeHistorySearchRows<T extends { id: string }>(
  recentMatches: T[],
  searchHits: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of [...searchHits, ...recentMatches]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
