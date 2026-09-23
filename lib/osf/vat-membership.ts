import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";

export type OsfVariant = "main" | "vat" | "non_vat";

export const OSF_VARIANTS = ["main", "vat", "non_vat"] as const;

/** ERP Product Priority option that marks VAT items (Cosmetics.lk Item Manufacturing). */
export const VAT_ERP_PRODUCT_PRIORITY = "Vat";

export function isVatErpPriority(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === VAT_ERP_PRODUCT_PRIORITY.toLowerCase();
}

/** True when ERP1 and/or ERP2 Product Priority is Vat. */
export function isVatCatalogRow(row: Pick<OsfCatalogRow, "erp1ProductPriority" | "erp2ProductPriority">): boolean {
  return isVatErpPriority(row.erp1ProductPriority) || isVatErpPriority(row.erp2ProductPriority);
}

export function filterCatalogByOsfVariant<T extends Pick<OsfCatalogRow, "erp1ProductPriority" | "erp2ProductPriority">>(
  catalog: T[],
  variant: OsfVariant,
): T[] {
  if (variant === "main") return catalog;
  if (variant === "vat") return catalog.filter(isVatCatalogRow);
  return catalog.filter((row) => !isVatCatalogRow(row));
}
