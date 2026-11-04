export type TransferSlot = "erp1" | "erp2";

export type TransferDirection = "store_to_shop" | "shop_to_main";

export type TransferStatus = "sent" | "received" | "requested" | "confirming" | "confirmed";

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
  /** ERP Item Manufacturing Tax Status: Vat, Non Vat, or Vat / Non Vat. */
  taxStatus?: string | null;
  /** Shop return destination. Vat and Vat / Non Vat are erp1, other items are erp2. */
  slot?: TransferSlot | null;
};

export type TransferLookupItem = {
  itemCode: string;
  itemName: string;
  barcode: string;
  uom: string;
  taxStatus: string | null;
  availableQty: number | null;
  slot?: TransferSlot | null;
};
