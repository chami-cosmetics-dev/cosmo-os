export type StockEntryLineInput = {
  itemCode: string;
  qty: number;
  uom?: string | null;
};

/** ERPNext Stock Entry body for a direct Material Transfer (not in transit). */
export function buildMaterialTransferBody(input: {
  company: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  lines: StockEntryLineInput[];
}) {
  return {
    naming_series: "MAT-STE-.YYYY.-",
    stock_entry_type: "Material Transfer",
    purpose: "Material Transfer",
    add_to_transit: 0,
    company: input.company,
    from_warehouse: input.sourceWarehouse,
    to_warehouse: input.targetWarehouse,
    items: input.lines.map((line) => ({
      item_code: line.itemCode,
      qty: line.qty,
      s_warehouse: input.sourceWarehouse,
      t_warehouse: input.targetWarehouse,
      uom: line.uom?.trim() || "Nos",
      conversion_factor: 1,
    })),
  };
}
