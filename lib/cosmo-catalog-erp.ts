export type CosmoCatalogErpCandidate = {
  id: string;
  label: string | null;
  baseUrl: string;
};

export type CosmoCatalogLocationLink = {
  name: string;
  locationReference: string | null;
  instanceId: string | null;
};

export function isCosmeticsShopLocation(
  name: string,
  locationReference?: string | null,
): boolean {
  if (/lwk/i.test(name) || (locationReference ?? "").trim().toUpperCase() === "LWK") {
    return false;
  }
  return /cosmetics\.lk/i.test(name);
}

/**
 * Cosmo catalog / Standard Selling lives on the Cosmetics.lk shop ERP (ERP_1),
 * not LWK / trading ERP_2.
 */
export function pickCosmoCatalogErpInstance(input: {
  locations: CosmoCatalogLocationLink[];
  instances: CosmoCatalogErpCandidate[];
}): CosmoCatalogErpCandidate | null {
  const byId = new Map(input.instances.map((row) => [row.id, row]));

  for (const loc of input.locations) {
    if (!isCosmeticsShopLocation(loc.name, loc.locationReference)) continue;
    const inst = loc.instanceId ? byId.get(loc.instanceId) : undefined;
    if (inst) return inst;
  }

  const erp1 = input.instances.find((row) => /erp[_\s-]*1\b/i.test(row.label ?? ""));
  if (erp1) return erp1;

  return input.instances.find((row) => /cosmetics-lk-01/i.test(row.baseUrl)) ?? null;
}
