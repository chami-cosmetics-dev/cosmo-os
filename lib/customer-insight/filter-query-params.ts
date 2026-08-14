/** Parse repeated or comma-separated Customer Insight filter list query values. */
export const INSIGHT_FILTER_LIST_MAX = 10;

export function normalizeInsightFilterList(
  values: string[] | undefined | null
): string[] | undefined {
  if (!values?.length) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
      if (out.length >= INSIGHT_FILTER_LIST_MAX) return out;
    }
  }
  return out.length ? out : undefined;
}

export function readInsightFilterList(
  sp: URLSearchParams,
  key: string
): string[] | undefined {
  return normalizeInsightFilterList(sp.getAll(key));
}

export function appendInsightFilterList(
  params: URLSearchParams,
  key: string,
  values: string[] | undefined
) {
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed) params.append(key, trimmed);
  }
}
