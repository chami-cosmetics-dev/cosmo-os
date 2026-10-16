import { isMainWarehouseName } from "@/lib/material-transfer/warehouses";

export const MAIN_COLUMNS = [
  { key: "cosmetics_main", label: "Cosmetics main", slot: "erp1", exact: "main warehouse - cosmo", token: "cosmo" },
  { key: "pevi", label: "Pevi", slot: "erp2", exact: "main warehouse - pevi", token: "pevi" },
  { key: "spk", label: "SPK", slot: "erp2", exact: "main warehouse - spk", token: "spk" },
  { key: "chami", label: "Chami", slot: "erp2", exact: "main warehouse - chami", token: "chami" },
  { key: "udara", label: "Udara", slot: "erp2", exact: "main warehouse - udara", token: "udara" },
  { key: "sdp", label: "SDP", slot: "erp2", exact: "main warehouse - sdp", token: "sdp" },
] as const;

export type MainColumnKey = (typeof MAIN_COLUMNS)[number]["key"];
export type ShopAvailability = "allowed" | "not_allowed" | null;

export type ShopRequestStock = {
  key: MainColumnKey;
  label: string;
  qty: number | null;
  cannotTransfer: boolean;
};

export type ResolvedMain = {
  key: MainColumnKey;
  label: string;
  slot: "erp1" | "erp2";
  warehouse: string | null;
};

type WarehouseRow = { name: string; company: string; slot: "erp1" | "erp2" };

function hasWord(value: string, token: string): boolean {
  return new RegExp(`\\b${token}\\b`, "i").test(value);
}

export function resolveMainWarehouses(rows: WarehouseRow[]): ResolvedMain[] {
  return MAIN_COLUMNS.map((column) => {
    const mains = rows.filter((row) => row.slot === column.slot && isMainWarehouseName(row.name));
    const exact = mains.filter((row) => row.name.trim().toLowerCase() === column.exact);
    let warehouse: string | null = null;
    if (exact.length === 1) {
      warehouse = exact[0]!.name;
    } else if (exact.length === 0 && column.slot === "erp2") {
      const tokens = mains.filter(
        (row) => hasWord(row.name, column.token) || hasWord(row.company, column.token),
      );
      warehouse = tokens.length === 1 ? tokens[0]!.name : null;
    }
    return { key: column.key, label: column.label, slot: column.slot, warehouse };
  });
}

export function stockCell(qty: number | null): { qty: number | null; cannotTransfer: boolean } {
  if (qty == null || !Number.isFinite(qty)) return { qty: null, cannotTransfer: false };
  return { qty, cannotTransfer: qty < 4 };
}

export function shopAvailabilityWarn(value: string | null | undefined): boolean {
  return value === "not_allowed";
}

export function normalizeShopAvailability(value: string | null | undefined): ShopAvailability {
  if (value === "allowed" || value === "not_allowed") return value;
  return null;
}

/** Item code plus the hyphen/underscore swap of a trailing variant (`SKU_1` / `SKU-1`). */
export function skuLookupKeys(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const swapped = /_\d+$/.test(trimmed)
    ? trimmed.replace(/_(\d+)$/, "-$1")
    : trimmed.replace(/-(\d+)$/, "_$1");
  return [...new Set([trimmed, swapped].filter(Boolean))];
}

export function assertUniqueItemCodes(codes: string[]): void {
  const seen = new Set<string>();
  for (const code of codes) {
    const key = code.trim();
    if (!key) continue;
    if (seen.has(key)) throw new Error(`Duplicate item ${key}`);
    seen.add(key);
  }
}

export function canMarkDone(status: string): boolean {
  return status === "pending";
}

export type ShopRequestLineView = {
  itemCode: string;
  itemName: string;
  barcode: string;
  neededQty: number;
  shopAvailability: ShopAvailability;
  stocks: ShopRequestStock[];
};

export type ShopRequestView = {
  id: string;
  outletName: string;
  status: "pending" | "done";
  createdAt: string;
  createdByName: string | null;
  doneAt: string | null;
  doneByName: string | null;
  lines: ShopRequestLineView[];
};
