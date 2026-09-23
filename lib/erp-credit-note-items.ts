export type CreditNoteSourceItem = {
  name?: string | null;
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  rate: number;
  income_account?: string;
  expense_account?: string;
  cost_center?: string;
  uom?: string;
  warehouse?: string | null;
  batch_no?: string | null;
};

export type CreditNoteSourceTax = {
  charge_type?: string | null;
  account_head: string;
  description?: string | null;
  included_in_print_rate?: number | null;
  cost_center?: string | null;
  rate?: number | null;
  tax_amount: number;
};

export type CreditNoteReturnItem = {
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  rate: number;
  income_account?: string;
  expense_account?: string;
  cost_center?: string;
  uom?: string;
  warehouse?: string;
  batch_no?: string;
  sales_invoice_item?: string;
};

export type CreditNoteReturnTax = {
  charge_type: string;
  account_head: string;
  description?: string;
  included_in_print_rate?: number;
  cost_center?: string;
  rate: number;
  tax_amount: number;
};

export function resolveCreditNoteWarehouse(
  itemWarehouse?: string | null,
  headerWarehouse?: string | null,
  locationWarehouse?: string | null,
): string {
  return itemWarehouse?.trim() || headerWarehouse?.trim() || locationWarehouse?.trim() || "";
}

/** Mirror original SI rows as submitted return lines, keeping warehouse for stock items. */
export function buildCreditNoteReturnItems(
  items: CreditNoteSourceItem[],
  fallbackWarehouse?: string | null,
): CreditNoteReturnItem[] {
  return items.map((item) => {
    const warehouse = resolveCreditNoteWarehouse(item.warehouse, fallbackWarehouse);
    const batchNo = item.batch_no?.trim() || "";
    const rowName = item.name?.trim() || "";
    return {
      item_code: item.item_code,
      item_name: item.item_name,
      description: item.description,
      qty: -Math.abs(item.qty),
      rate: item.rate,
      income_account: item.income_account,
      cost_center: item.cost_center,
      uom: item.uom,
      ...(item.expense_account ? { expense_account: item.expense_account } : {}),
      ...(warehouse ? { warehouse } : {}),
      ...(batchNo ? { batch_no: batchNo } : {}),
      ...(rowName ? { sales_invoice_item: rowName } : {}),
    };
  });
}

/** Negate header charges (shipping etc.) so Return SI matches original grand total. */
export function buildCreditNoteReturnTaxes(
  taxes?: CreditNoteSourceTax[] | null,
): CreditNoteReturnTax[] {
  if (!taxes?.length) return [];
  return taxes
    .filter((tax) => tax.account_head?.trim())
    .map((tax) => ({
      charge_type: tax.charge_type?.trim() || "Actual",
      account_head: tax.account_head.trim(),
      description: tax.description ?? undefined,
      included_in_print_rate: tax.included_in_print_rate ?? undefined,
      cost_center: tax.cost_center ?? undefined,
      rate: tax.charge_type?.trim() === "Actual" ? 0 : (tax.rate ?? 0),
      tax_amount: -Math.abs(Number(tax.tax_amount) || 0),
    }));
}
