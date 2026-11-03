/**
 * Floor outlet ↔ trading company ↔ Cosmetics.lk POS.
 * Outlet names match Settings → Outlets. Trading shortName matches CompanyLocation.shortName.
 * SPK/Nittabuwa has no Cosmetics POS Profile yet — trading shop only.
 */

export type BookNoteOutletShopMap = {
  /** Cosmo `Outlet.name` when a floor shop exists. */
  outletName: string | null;
  tradingShortName: string;
  cosmeticsPosProfile: string | null;
  cosmeticsWarehouses: string[];
};

export const BOOK_NOTE_OUTLET_SHOP_MAP: readonly BookNoteOutletShopMap[] = [
  {
    outletName: "Maharagama",
    tradingShortName: "DRO",
    cosmeticsPosProfile: "Maharagama Shop",
    cosmeticsWarehouses: ["Maharagama Shop Warehouse - Cosmo"],
  },
  {
    outletName: "Pepiliyana",
    tradingShortName: "LMJ",
    cosmeticsPosProfile: "Pepiliyana Shop",
    cosmeticsWarehouses: ["Pepiliyana Shop Warehouse - Cosmo"],
  },
  {
    outletName: "CoolPlanet",
    tradingShortName: "MNK",
    cosmeticsPosProfile: "Cool Planet Nugegoda Shop",
    cosmeticsWarehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
  },
  {
    outletName: "Kiribathgoda",
    tradingShortName: "AJS",
    cosmeticsPosProfile: "Kiribathgoda Shop",
    cosmeticsWarehouses: ["Kiribathgoda Shop Warehouse - Cosmo"],
  },
  {
    outletName: "Galle",
    tradingShortName: "Chami",
    cosmeticsPosProfile: "GCC Shop",
    cosmeticsWarehouses: ["GCC Shop Warehouse - Cosmo"],
  },
  {
    outletName: "Negombo",
    tradingShortName: "DTD",
    cosmeticsPosProfile: "Negombo Shop",
    cosmeticsWarehouses: ["Negombo Shop Warehouse - Cosmo"],
  },
  {
    outletName: null,
    tradingShortName: "SPK",
    cosmeticsPosProfile: null,
    cosmeticsWarehouses: [],
  },
  {
    outletName: "OGF",
    tradingShortName: "LWK",
    cosmeticsPosProfile: "OGF Shop",
    cosmeticsWarehouses: ["OGF Shop Warehouse - Cosmo"],
  },
] as const;

export type BookNoteCosmeticsPosScope = {
  posProfiles: string[];
  warehouses: string[];
};

const COSMETICS_COMPANY_NAMES = new Set(["cosmetics.lk", "cosmo"]);

export function isCosmeticsBookNoteLocation(location: {
  erpnextCompany?: string | null;
  name?: string | null;
  shortName?: string | null;
}): boolean {
  const keys = [location.erpnextCompany, location.name, location.shortName]
    .map((v) => (v ?? "").trim().toLowerCase())
    .filter(Boolean);
  return keys.some((k) => COSMETICS_COMPANY_NAMES.has(k));
}

export function bookNoteMapsForOutletName(
  outletName: string | null | undefined,
): BookNoteOutletShopMap[] {
  const name = (outletName ?? "").trim();
  if (!name) return [];
  return BOOK_NOTE_OUTLET_SHOP_MAP.filter((m) => m.outletName === name);
}

export function bookNoteMapsForTradingShortName(
  shortName: string | null | undefined,
): BookNoteOutletShopMap[] {
  const name = (shortName ?? "").trim();
  if (!name) return [];
  return BOOK_NOTE_OUTLET_SHOP_MAP.filter((m) => m.tradingShortName === name);
}

export function collectBookNoteTradingShortNames(input: {
  outletName?: string | null;
  locationShortNames?: string[];
}): string[] {
  const names = new Set<string>();
  for (const m of bookNoteMapsForOutletName(input.outletName)) {
    names.add(m.tradingShortName);
  }
  for (const shortName of input.locationShortNames ?? []) {
    const trimmed = shortName.trim();
    if (trimmed) names.add(trimmed);
  }
  return [...names];
}

export function collectBookNoteCosmeticsPosScope(input: {
  outletName?: string | null;
  locationShortNames?: string[];
}): BookNoteCosmeticsPosScope | null {
  const maps = [
    ...bookNoteMapsForOutletName(input.outletName),
    ...(input.locationShortNames ?? []).flatMap((s) =>
      bookNoteMapsForTradingShortName(s),
    ),
  ];
  const posProfiles = new Set<string>();
  const warehouses = new Set<string>();
  for (const m of maps) {
    if (m.cosmeticsPosProfile) posProfiles.add(m.cosmeticsPosProfile);
    for (const wh of m.cosmeticsWarehouses) warehouses.add(wh);
  }
  if (posProfiles.size === 0 && warehouses.size === 0) return null;
  return {
    posProfiles: [...posProfiles],
    warehouses: [...warehouses],
  };
}

/** True when an order belongs to the merchant's Cosmetics POS floor. */
export function orderMatchesCosmeticsPosScope(input: {
  posProfile?: string | null;
  erpnextWarehouse?: string | null;
  scope: BookNoteCosmeticsPosScope;
}): boolean {
  const profile = (input.posProfile ?? "").trim();
  const warehouse = (input.erpnextWarehouse ?? "").trim();
  if (profile && input.scope.posProfiles.includes(profile)) return true;
  if (warehouse && input.scope.warehouses.includes(warehouse)) return true;
  return false;
}
