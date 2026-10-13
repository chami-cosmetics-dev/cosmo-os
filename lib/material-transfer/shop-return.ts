import { isShopWarehouseName } from "@/lib/item-trends/shop-warehouse-name";
import { warehouseMatchesOutlet } from "@/lib/material-transfer/receive";
import type { TransferSlot, TransferWarehouse } from "@/lib/material-transfer/types";
import { isMainWarehouseName } from "@/lib/material-transfer/warehouses";

export type ShopReturnWarehouse = TransferWarehouse & { slot: TransferSlot };

export type ShopReturnResolution =
  | {
      ok: true;
      slot: TransferSlot;
      erpCompany: string;
      sourceWarehouse: string;
      targetWarehouse: string;
    }
  | { ok: false; error: string };

export function resolveShopToMain(
  outletName: string | null | undefined,
  warehouses: ShopReturnWarehouse[],
): ShopReturnResolution {
  const outlet = (outletName ?? "").trim();
  if (!outlet) {
    return { ok: false, error: "No shop warehouse is allocated for this outlet." };
  }
  const shops = warehouses.filter(
    (row) => isShopWarehouseName(row.name) && warehouseMatchesOutlet(row.name, outlet),
  );
  if (shops.length === 0) {
    return { ok: false, error: "No shop warehouse is allocated for this outlet." };
  }
  if (shops.length > 1) {
    return { ok: false, error: "More than one shop warehouse matches this outlet." };
  }
  const shop = shops[0]!;
  const mains = warehouses.filter(
    (row) =>
      row.slot === shop.slot &&
      row.company === shop.company &&
      row.name !== shop.name &&
      isMainWarehouseName(row.name),
  );
  if (mains.length === 0) {
    return { ok: false, error: "No main warehouse is allocated for this shop." };
  }
  if (mains.length > 1) {
    return { ok: false, error: "More than one main warehouse matches this shop." };
  }
  return {
    ok: true,
    slot: shop.slot,
    erpCompany: shop.company,
    sourceWarehouse: shop.name,
    targetWarehouse: mains[0]!.name,
  };
}
