import type { MarketPriceCompetitorMeta } from "./types";

export type CompetitorDefinition = MarketPriceCompetitorMeta & {
  sortOrder: number;
  active: boolean;
};

export const FIXED_COMPETITORS: readonly CompetitorDefinition[] = [
  {
    slug: "angels-beauty",
    name: "Angels Beauty",
    websiteDomain: "angelsbeauty.lk",
    sortOrder: 1,
    active: true,
  },
  {
    slug: "essentials",
    name: "Essentials",
    websiteDomain: "essentials.lk",
    sortOrder: 2,
    active: true,
  },
  {
    slug: "liberty-store",
    name: "Liberty Store",
    websiteDomain: "libertystore.lk",
    sortOrder: 3,
    active: true,
  },
  {
    slug: "kiki-beauty",
    name: "Kiki Beauty",
    websiteDomain: "kikibeauty.lk",
    sortOrder: 4,
    active: true,
  },
  {
    slug: "dreams-of-ceylonese",
    name: "Dreams of Ceylonese",
    websiteDomain: "dreamsofceylonese.com",
    sortOrder: 5,
    active: true,
  },
  {
    slug: "watsans",
    name: "Watsans",
    websiteDomain: "watsans.lk",
    sortOrder: 6,
    active: true,
  },
] as const;

export function getCompetitorBySlug(slug: string): CompetitorDefinition | undefined {
  const normalized = slug.trim().toLowerCase();
  return FIXED_COMPETITORS.find((c) => c.slug === normalized);
}

export function findCompetitorByNameOrSlug(input: string): CompetitorDefinition | undefined {
  const val = input.trim().toLowerCase();
  if (!val) return undefined;

  // Exact slug
  const bySlug = getCompetitorBySlug(val);
  if (bySlug) return bySlug;

  // Exact or normalized name match
  const byName = FIXED_COMPETITORS.find(
    (c) => c.name.toLowerCase() === val || c.name.toLowerCase().replace(/\s+/g, "-") === val,
  );
  if (byName) return byName;

  // Domain match
  return FIXED_COMPETITORS.find((c) => c.websiteDomain.toLowerCase() === val);
}

export function validateCompetitorProductUrl(
  url: string,
  expectedDomain?: string,
): { valid: boolean; warning?: string; host?: string } {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, warning: "URL must start with http:// or https://" };
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (expectedDomain) {
      const cleanExpected = expectedDomain.toLowerCase().replace(/^www\./, "");
      if (host !== cleanExpected && !host.endsWith(`.${cleanExpected}`)) {
        return {
          valid: true,
          warning: `Host ${host} does not match expected domain ${cleanExpected}`,
          host,
        };
      }
    }
    return { valid: true, host };
  } catch {
    return { valid: false, warning: "Invalid URL format" };
  }
}
