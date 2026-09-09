export const VAULT_OSF_UNIT_KEYS = ["sv", "ori", "ae"] as const;
export type VaultOsfUnitKey = (typeof VAULT_OSF_UNIT_KEYS)[number];

/** Mistaken ERP2 company — never included in Vault OSF. */
export const EXCLUDED_ERP_COMPANIES = new Set(["origins online"]);

export function isExcludedErpCompany(name: string | null | undefined): boolean {
  return EXCLUDED_ERP_COMPANIES.has((name ?? "").trim().toLowerCase());
}

export type VaultBusinessUnit = {
  key: VaultOsfUnitKey;
  label: string;
  erpInstanceId: string;
  erpCompany: string;
  warehouses: string[];
  sortOrder: number;
};

export type VaultCatalogRow = {
  sku: string;
  variantSku: string;
  barcode: string | null;
  itemName: string;
  brand: string | null;
  category: string | null;
  country: string | null;
  priorityStatus: string | null;
};

export type SalesCell = {
  qty: number | null;
  source: "erp" | "import" | null;
};

export type PurchaseCell = {
  qty: number | null;
  netValue: number | null;
};

export type PriceInfo = {
  mrp: number | null;
  discountPercent: number | null;
  discountedPrice: number | null;
};

export type LatestPurchase = {
  rate: number | null;
  supplier: string | null;
  date: string | null;
};
