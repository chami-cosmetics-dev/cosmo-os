export type StockEntryLineInput = {
  itemCode: string;
  qty: number;
  uom?: string | null;
};

/** Body for the ERP `cosmo_save_doc` API script. Owner is the Cosmo user's ERP email. */
export function buildCosmoSaveDocCall(input: {
  owner: string;
  doc: ReturnType<typeof buildMaterialTransferBody>;
}) {
  return {
    owner: input.owner.trim(),
    action: "insert" as const,
    doc: {
      doctype: "Stock Entry" as const,
      ...input.doc,
    },
  };
}

/** `cosmo_save_doc` returns `{ message: { name } }`. */
export function stockEntryNameFromSaveDoc(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as { name?: unknown; message?: unknown };
  const message = body.message;
  if (message && typeof message === "object" && "name" in message) {
    return String((message as { name?: unknown }).name ?? "").trim();
  }
  if (typeof message === "string") return message.trim();
  return String(body.name ?? "").trim();
}

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
