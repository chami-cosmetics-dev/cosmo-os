export type TransferSlot = "erp1" | "erp2";

export type TransferWarehouse = {
  name: string;
  company: string;
};

export type TransferLine = {
  itemCode: string;
  itemName: string;
  barcode: string;
  uom: string;
  qty: number;
  /** Qty in the source warehouse when the line was added. Null after the source changes. */
  availableQty: number | null;
};

export type TransferLookupItem = {
  itemCode: string;
  itemName: string;
  barcode: string;
  uom: string;
  taxStatus: string | null;
  availableQty: number | null;
};
