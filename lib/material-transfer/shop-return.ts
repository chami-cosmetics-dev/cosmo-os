import { isShopWarehouseName } from "@/lib/item-trends/shop-warehouse-name";
import {
  outletErp2CompanyCode,
  warehouseHasErp2CompanyCode,
  warehouseMatchesOutlet,
} from "@/lib/material-transfer/receive";
import type { TransferSlot, TransferWarehouse } from "@/lib/material-transfer/types";
import { isMainWarehouseName } from "@/lib/material-transfer/warehouses";
import { isVatTaxStatus } from "@/lib/osf/vat-membership";

export type ShopReturnWarehouse = TransferWarehouse & { slot: TransferSlot };

export type ShopReturnLeg = {
  slot: TransferSlot;
  erpCompany: string;
  sourceWarehouse: string;
  targetWarehouse: string;
};

export type ShopReturnResolution =
  | { ok: true; legs: ShopReturnLeg[] }
  | { ok: false; error: string };

export type ShopReturnHeader =
  | {
      ok: true;
      slot: TransferSlot | "mixed";
      erpCompany: string;
      sourceWarehouse: string;
      targetWarehouse: string;
      erpCompany2: string | null;
      sourceWarehouse2: string | null;
      targetWarehouse2: string | null;
    }
  | { ok: false; error: string };

/** Vat and Vat / Non Vat post to ERP1. Every other line posts to ERP2. */
export function shopReturnDestination(taxStatus: string | null | undefined): TransferSlot {
  return isVatTaxStatus(taxStatus) ? "erp1" : "erp2";
}

/** Prefer ERP1 tax status when the SKU is on ERP1, so Vat / Non Vat stays on ERP1. */
export function shopReturnTaxStatus(
  erp1TaxStatus: string | null | undefined,
  erp2TaxStatus: string | null | undefined,
  onErp1: boolean,
): string | null {
  const erp1 = (erp1TaxStatus ?? "").trim() || null;
  const erp2 = (erp2TaxStatus ?? "").trim() || null;
  if (onErp1) return erp1 ?? erp2;
  return erp2 ?? erp1;
}

function isCosmeticsMainWarehouse(row: { name: string; company: string }): boolean {
  if (!isMainWarehouseName(row.name)) return false;
  const name = row.name.trim().toLowerCase();
  if (name === "main warehouse - cosmo") return true;
  const company = row.company.trim().toLowerCase().replace(/[^a-z]/g, "");
  return company.includes("cosmetic") && /\bcosmo\b/.test(name);
}

export function resolveShopToMain(
  outletName: string | null | undefined,
  warehouses: ShopReturnWarehouse[],
): ShopReturnResolution {
  const outlet = (outletName ?? "").trim();
  if (!outlet) {
    return { ok: false, error: "No shop warehouse is allocated for this outlet." };
  }
  const legs: ShopReturnLeg[] = [];
  const erp1Shops = warehouses.filter(
    (row) => row.slot === "erp1" && isShopWarehouseName(row.name) && warehouseMatchesOutlet(row.name, outlet),
  );
  if (erp1Shops.length > 1) {
    return { ok: false, error: "More than one shop warehouse matches this outlet." };
  }
  if (erp1Shops.length === 1) {
    const shop = erp1Shops[0]!;
    const mains = warehouses.filter(
      (row) =>
        row.slot === "erp1" &&
        row.company === shop.company &&
        row.name !== shop.name &&
        isCosmeticsMainWarehouse(row),
    );
    const exactCosmetics = mains.filter((row) => row.name.trim().toLowerCase() === "main warehouse - cosmo");
    const target = exactCosmetics.length === 1 ? exactCosmetics : mains;
    if (target.length === 0) {
      return { ok: false, error: "No Cosmetics main warehouse is allocated for VAT items." };
    }
    if (target.length > 1) {
      return { ok: false, error: "More than one main warehouse matches this shop." };
    }
    legs.push({
      slot: "erp1",
      erpCompany: shop.company,
      sourceWarehouse: shop.name,
      targetWarehouse: target[0]!.name,
    });
  }

  const companyCode = outletErp2CompanyCode(outlet);
  if (companyCode) {
    const erp2Shops = warehouses.filter(
      (row) =>
        row.slot === "erp2" && isShopWarehouseName(row.name) && warehouseHasErp2CompanyCode(row.name, companyCode),
    );
    if (erp2Shops.length > 1) {
      return { ok: false, error: "More than one shop warehouse matches this outlet." };
    }
    if (erp2Shops.length === 1) {
      const shop = erp2Shops[0]!;
      const mains = warehouses.filter(
        (row) =>
          row.slot === "erp2" &&
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
      legs.push({
        slot: "erp2",
        erpCompany: shop.company,
        sourceWarehouse: shop.name,
        targetWarehouse: mains[0]!.name,
      });
    }
  }

  if (legs.length === 0) {
    return { ok: false, error: "No shop warehouse is allocated for this outlet." };
  }
  return { ok: true, legs };
}

export function shopReturnHeader(legs: ShopReturnLeg[], lineSlots: TransferSlot[]): ShopReturnHeader {
  const used = new Set(lineSlots);
  const erp1 = used.has("erp1") ? (legs.find((leg) => leg.slot === "erp1") ?? null) : null;
  const erp2 = used.has("erp2") ? (legs.find((leg) => leg.slot === "erp2") ?? null) : null;
  if (used.has("erp1") && !erp1) {
    return { ok: false, error: "No ERP1 shop warehouse is allocated for VAT items." };
  }
  if (used.has("erp2") && !erp2) {
    return { ok: false, error: "No ERP2 shop warehouse is allocated for items that are not VAT." };
  }
  if (erp1 && erp2) {
    return {
      ok: true,
      slot: "mixed",
      erpCompany: erp1.erpCompany,
      sourceWarehouse: erp1.sourceWarehouse,
      targetWarehouse: erp1.targetWarehouse,
      erpCompany2: erp2.erpCompany,
      sourceWarehouse2: erp2.sourceWarehouse,
      targetWarehouse2: erp2.targetWarehouse,
    };
  }
  const only = erp1 ?? erp2;
  if (!only) return { ok: false, error: "Add at least one item." };
  return {
    ok: true,
    slot: only.slot,
    erpCompany: only.erpCompany,
    sourceWarehouse: only.sourceWarehouse,
    targetWarehouse: only.targetWarehouse,
    erpCompany2: null,
    sourceWarehouse2: null,
    targetWarehouse2: null,
  };
}
