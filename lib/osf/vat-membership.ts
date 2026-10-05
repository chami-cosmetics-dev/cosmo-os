import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";

export type OsfVariant = "main" | "vat" | "non_vat";

export const OSF_VARIANTS = ["main", "vat", "non_vat"] as const;

/** ERP Product Priority option that marks VAT items (legacy; OSF VAT Status uses Tax Status). */
export const VAT_ERP_PRODUCT_PRIORITY = "Vat";

export function isVatErpPriority(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === VAT_ERP_PRODUCT_PRIORITY.toLowerCase();
}

/** ERP Item Manufacturing Tax Status options: Non Vat | Vat | Vat / Non Vat. */
export function isVatTaxStatus(value: string | null | undefined): boolean {
  const n = (value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!n) return false;
  if (n === "non vat" || n === "nonvat") return false;
  return n.split("/").some((part) => part.trim() === "vat");
}

export type OsfTaxStatusFields = Pick<OsfCatalogRow, "erp1TaxStatus" | "erp2TaxStatus">;

/** True when ERP1 and/or ERP2 Tax Status is Vat (or Vat / Non Vat). */
export function isVatCatalogRow(row: OsfTaxStatusFields): boolean {
  return isVatTaxStatus(row.erp1TaxStatus) || isVatTaxStatus(row.erp2TaxStatus);
}

/** OSF identity: ERP Tax Status text. Blank if neither ERP has a value. */
export function vatStatusLabel(row: OsfTaxStatusFields): string {
  const a = (row.erp1TaxStatus ?? "").trim();
  const b = (row.erp2TaxStatus ?? "").trim();
  if (a && b && a.toLowerCase() !== b.toLowerCase()) return `${a} / ${b}`;
  return a || b || "";
}

export function filterCatalogByOsfVariant<T extends OsfTaxStatusFields>(
  catalog: T[],
  variant: OsfVariant,
): T[] {
  if (variant === "main") return catalog;
  if (variant === "vat") return catalog.filter(isVatCatalogRow);
  return catalog.filter((row) => !isVatCatalogRow(row));
}

export function applyTaxStatusToCatalog<T extends OsfCatalogRow>(
  catalog: T[],
  erp1BySku: Map<string, string | null>,
  erp2BySku: Map<string, string | null>,
  normalizeSku: (sku: string) => string,
): T[] {
  return catalog.map((row) => {
    const key = normalizeSku(row.sku);
    return {
      ...row,
      erp1TaxStatus: erp1BySku.has(key) ? (erp1BySku.get(key) ?? null) : row.erp1TaxStatus,
      erp2TaxStatus: erp2BySku.has(key) ? (erp2BySku.get(key) ?? null) : row.erp2TaxStatus,
    };
  });
}
