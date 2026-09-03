import "server-only";

import { inferDistrictFromAddressText } from "@/lib/address-district";
import { isCosmeticsLkLocationName } from "@/lib/cosmetics-lk-location";
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

/** Online / web channels — not physical shops for outlet balance or transfers. */
export function isOnlineChannelName(name: string | null | undefined): boolean {
  return isCosmeticsLkLocationName(name);
}

/** True for retail shop floors — not Main / Stores / Website / transit. */
export function isShopWarehouseName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (n.includes("website")) return false;
  if (n.includes("goods in transit") || n.includes("transit")) return false;
  if (n.includes("work in progress") || n.includes("finished goods")) return false;
  if (n.startsWith("all warehouses")) return false;
  // Explicit shop floors (Cosmetics.lk POS + trading "Shop Warehouse - X")
  if (/\bshop\b/.test(n)) return true;
  return false;
}

/**
 * Cosmetics.lk POS shops (GCC, Pepiliyana, …) live as OSF columns with
 * direct warehouses — not separate Cosmo locations. Include them as physical shops.
 */
export function isCosmeticsLkInternalShopColumn(col: {
  key?: string;
  label: string;
  companyLocationId: string | null;
  warehouses?: string[];
  directWarehouses?: string[];
}): boolean {
  if (isOnlineChannelName(col.label)) return false;
  if ((col.key ?? "").startsWith("cosmo_shop_")) return true;
  const warehouses = [...(col.warehouses ?? []), ...(col.directWarehouses ?? [])].filter(
    (w) => w.trim().length > 0,
  );
  return (
    !col.companyLocationId &&
    warehouses.length > 0 &&
    warehouses.some((w) => isShopWarehouseName(w))
  );
}

export function physicalShopLocationIds(shops: PhysicalShopMeta[]): Set<string> {
  const ids = new Set<string>();
  for (const shop of shops) {
    for (const id of shop.locationIds) ids.add(id);
  }
  return ids;
}

/** Cosmetics.lk website/location OSF column — online + mixed, not a shop floor. */
export function isCosmeticsLkLocationColumn(col: {
  label: string;
  companyLocationId: string | null;
  companyLocationName?: string | null;
}): boolean {
  if (!col.companyLocationId) return false;
  return (
    isOnlineChannelName(col.label) || isOnlineChannelName(col.companyLocationName)
  );
}

/** Shop-floor warehouses only for this OSF column (outlet balance / transfers). */
export function shopWarehousesForColumn(col: {
  warehouses?: string[];
  directWarehouses?: string[];
}): string[] {
  const all = [...(col.warehouses ?? []), ...(col.directWarehouses ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const wh of all) {
    const trimmed = wh.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!isShopWarehouseName(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Outlet transfer columns = Cosmetics.lk POS shops + trading locations that have
 * a Shop Warehouse. Never Cosmetics.lk website / Main-only / online.
 */
export function isPhysicalShopOsfColumn(
  col: {
    key?: string;
    label: string;
    companyLocationId: string | null;
    companyLocationName?: string | null;
    warehouses?: string[];
    directWarehouses?: string[];
  },
  _shops?: PhysicalShopMeta[],
): boolean {
  if (isCosmeticsLkLocationColumn(col)) return false;
  if (isOnlineChannelName(col.label) || isOnlineChannelName(col.companyLocationName)) {
    return false;
  }
  if (isCosmeticsLkInternalShopColumn(col)) return true;
  // Trading OSF stock columns with a Shop Warehouse are shop floors — do not require
  // an Outlet staff mapping (that gate hid LMJ/AJS/… even when Shop WH exists).
  if (shopWarehousesForColumn(col).length === 0) return false;
  return Boolean(col.companyLocationId);
}

/** Match staff outlet name to a company location / OSF shop column. */
export function matchOutletToLocationIds(
  outletName: string,
  locations: Array<{ id: string; name: string; shortName: string | null }>,
  osfLabels: Array<{ key: string; label: string; companyLocationId: string | null }>,
): string[] {
  const target = normalizeName(outletName);
  if (!target || isOnlineChannelName(outletName)) return [];

  const ids = new Set<string>();
  for (const loc of locations) {
    if (isOnlineChannelName(loc.name) || isOnlineChannelName(loc.shortName)) continue;
    const names = [loc.name, loc.shortName].filter(Boolean) as string[];
    for (const name of names) {
      const n = normalizeName(name);
      if (n === target || n.includes(target) || target.includes(n)) {
        ids.add(loc.id);
      }
    }
  }

  for (const col of osfLabels) {
    if (isOnlineChannelName(col.label)) continue;
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

  const locationById = new Map(locations.map((loc) => [loc.id, loc]));
  const shops: PhysicalShopMeta[] = outlets
    .filter((outlet) => !isOnlineChannelName(outlet.name))
    .map((outlet) => {
      const locationIds = new Set<string>();
      for (const profile of profiles) {
        if (profile.outletId !== outlet.id || !profile.locationId) continue;
        const loc = locationById.get(profile.locationId);
        if (loc && (isOnlineChannelName(loc.name) || isOnlineChannelName(loc.shortName))) {
          continue;
        }
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
