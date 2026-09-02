import "server-only";

import { inferDistrictFromAddressText } from "@/lib/address-district";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { prisma } from "@/lib/prisma";

export type PhysicalShopMeta = {
  outletId: string;
  name: string;
  district: string | null;
  locationIds: string[];
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match staff outlet name to a company location / OSF shop column. */
export function matchOutletToLocationIds(
  outletName: string,
  locations: Array<{ id: string; name: string; shortName: string | null }>,
  osfLabels: Array<{ key: string; label: string; companyLocationId: string | null }>,
): string[] {
  const target = normalizeName(outletName);
  if (!target) return [];

  const ids = new Set<string>();
  for (const loc of locations) {
    const names = [loc.name, loc.shortName].filter(Boolean) as string[];
    for (const name of names) {
      const n = normalizeName(name);
      if (n === target || n.includes(target) || target.includes(n)) {
        ids.add(loc.id);
      }
    }
  }

  for (const col of osfLabels) {
    const label = normalizeName(col.label);
    if (
      col.companyLocationId &&
      (label === target || label.includes(target) || target.includes(label))
    ) {
      ids.add(col.companyLocationId);
    }
  }

  return [...ids];
}

export function nearestPhysicalShopName(
  district: string,
  shops: PhysicalShopMeta[],
): string | null {
  const match = shops.find((shop) => shop.district === district);
  return match?.name ?? null;
}

export function shopDistrictForLocation(
  locationId: string | null | undefined,
  shops: PhysicalShopMeta[],
  fallbackLocationDistrict: Map<string, string | null>,
): string | null {
  if (!locationId) return null;
  for (const shop of shops) {
    if (!shop.locationIds.includes(locationId)) continue;
    if (shop.district) return shop.district;
    return fallbackLocationDistrict.get(locationId) ?? null;
  }
  return null;
}

export function isPhysicalShopLocation(
  locationId: string | null | undefined,
  shops: PhysicalShopMeta[],
): boolean {
  if (!locationId) return false;
  return shops.some((shop) => shop.locationIds.includes(locationId));
}

export async function loadPhysicalShops(companyId: string): Promise<PhysicalShopMeta[]> {
  const [outlets, profiles, locations, osfColumns] = await Promise.all([
    prisma.outlet.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employeeProfile.findMany({
      where: { companyId, outletId: { not: null } },
      select: {
        outletId: true,
        locationId: true,
        outlet: { select: { id: true, name: true } },
      },
    }),
    prisma.companyLocation.findMany({
      where: { companyId },
      select: { id: true, name: true, shortName: true },
    }),
    resolveOsfColumns(companyId),
  ]);

  const osfLabels = osfColumns
    .filter((c) => c.active && c.includeInStock)
    .map((c) => ({
      key: c.key,
      label: c.label,
      companyLocationId: c.companyLocationId,
    }));

  const shops: PhysicalShopMeta[] = outlets.map((outlet) => {
    const locationIds = new Set<string>();
    for (const profile of profiles) {
      if (profile.outletId !== outlet.id || !profile.locationId) continue;
      locationIds.add(profile.locationId);
    }
    for (const id of matchOutletToLocationIds(outlet.name, locations, osfLabels)) {
      locationIds.add(id);
    }

    return {
      outletId: outlet.id,
      name: outlet.name,
      district: inferDistrictFromAddressText(outlet.name),
      locationIds: [...locationIds],
    };
  });

  return shops;
}
