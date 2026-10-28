import { isVatTaxStatus } from "@/lib/osf/vat-membership";

export const VAT_STATUS_PERMISSION = "products.vat_status.read";

export type ErpItemTaxHit = {
  itemCode: string;
  itemName: string | null;
  taxStatus: string | null;
  productPriority?: string | null;
};

export type VatStatusSlotId = "erp1" | "erp2";

export type VatStatusSlot = {
  id: VatStatusSlotId;
  label: string;
  configured: boolean;
  found: boolean;
  itemName: string | null;
  taxStatus: string | null;
  productPriority: string | null;
  vat: boolean;
  error: string | null;
};

export type VatStatusLookup = {
  sku: string;
  erp1: VatStatusSlot;
  erp2: VatStatusSlot;
};

export function skuKey(value: string): string {
  return value.trim().toUpperCase();
}

export function pickErpTaxHit(hits: ErpItemTaxHit[], sku: string): ErpItemTaxHit | null {
  const key = skuKey(sku);
  return hits.find((hit) => skuKey(hit.itemCode) === key) ?? null;
}

export function buildVatStatusSlot(input: {
  id: VatStatusSlotId;
  label: string;
  configured: boolean;
  hit?: ErpItemTaxHit | null;
  error?: string | null;
}): VatStatusSlot {
  const error = input.error?.trim() || null;
  if (!input.configured || error) {
    return {
      id: input.id,
      label: input.label,
      configured: input.configured,
      found: false,
      itemName: null,
      taxStatus: null,
      productPriority: null,
      vat: false,
      error,
    };
  }

  const hit = input.hit ?? null;
  const taxStatus = hit?.taxStatus?.trim() || null;
  return {
    id: input.id,
    label: input.label,
    configured: true,
    found: Boolean(hit),
    itemName: hit?.itemName?.trim() || null,
    taxStatus,
    productPriority: hit?.productPriority?.trim() || null,
    vat: isVatTaxStatus(taxStatus),
    error: null,
  };
}

export function productPriorityLabel(
  erp1: string | null | undefined,
  erp2: string | null | undefined,
): string {
  const a = (erp1 ?? "").trim();
  const b = (erp2 ?? "").trim();
  if (a && b && a.toLowerCase() !== b.toLowerCase()) return `${a} / ${b}`;
  return a || b;
}

export function mergeItemTaxLabels(
  erp1: Pick<ErpItemTaxHit, "taxStatus" | "productPriority"> | null | undefined,
  erp2: Pick<ErpItemTaxHit, "taxStatus" | "productPriority"> | null | undefined,
): { taxStatus: string | null; productPriority: string | null } {
  return {
    taxStatus: productPriorityLabel(erp1?.taxStatus, erp2?.taxStatus) || null,
    productPriority: productPriorityLabel(erp1?.productPriority, erp2?.productPriority) || null,
  };
}
