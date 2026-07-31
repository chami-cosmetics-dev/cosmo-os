import { readFileSync } from "node:fs";

import type { AdaptLocationMapEntry } from "@/lib/adapt-import/types";

function normName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type CompanyLocationLike = {
  id: string;
  name: string;
  shortName: string | null;
  locationReference: string | null;
};

export function loadAdaptLocationMapFromJson(jsonText: string): AdaptLocationMapEntry[] {
  const parsed = JSON.parse(jsonText) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Location map must be a JSON array");
  }
  return parsed.map((entry, index) => {
    const row = entry as AdaptLocationMapEntry;
    if (!row?.companyLocationId?.trim()) {
      throw new Error(`Location map entry ${index} missing companyLocationId`);
    }
    return {
      salesLocationId: row.salesLocationId?.trim() || undefined,
      locationName: row.locationName?.trim() || undefined,
      companyLocationId: row.companyLocationId.trim(),
    };
  });
}

export function loadAdaptLocationMapFile(path: string): AdaptLocationMapEntry[] {
  return loadAdaptLocationMapFromJson(readFileSync(path, "utf8"));
}

/** Resolve Cosmo location id from map + optional name/shortName/locationReference fallback. */
export function resolveAdaptCompanyLocationId(input: {
  salesLocationId: string | null;
  locationName: string | null;
  map: AdaptLocationMapEntry[];
  locations: CompanyLocationLike[];
}): string | null {
  const byId = input.salesLocationId?.trim();
  if (byId) {
    const hit = input.map.find((e) => e.salesLocationId === byId);
    if (hit && input.locations.some((l) => l.id === hit.companyLocationId)) {
      return hit.companyLocationId;
    }
  }

  const byName = normName(input.locationName);
  if (byName) {
    const mapHit = input.map.find((e) => normName(e.locationName) === byName);
    if (mapHit && input.locations.some((l) => l.id === mapHit.companyLocationId)) {
      return mapHit.companyLocationId;
    }

    const locHit = input.locations.find(
      (l) =>
        normName(l.name) === byName ||
        normName(l.shortName) === byName ||
        normName(l.locationReference) === byName
    );
    if (locHit) return locHit.id;
  }

  return null;
}
