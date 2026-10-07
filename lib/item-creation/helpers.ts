export const ITEM_CREATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ITEM_CREATED: "Item Created",
  COMPLETED: "Completed",
  IMAGE_CREATED: "Image Created",
  LOCKED: "Locked",
  WAITING_ACTIVATION: "Waiting Activation",
  ACTIVATED: "Activated",
  WAITING_FOR_PRICES: "Waiting for Prices",
  PRICE_UPDATED: "Price Updated",
  WAITING_FOR_PRICE: "Waiting for Price",
  READY_FOR_STOCK: "Ready for Stock",
  STOCK_ADDED: "Stock Added",
  SENT: "Sent",
  RECEIVED: "Received",
  IN_PROGRESS: "In Progress",
  CANCELLED: "Cancelled",
};

export type PriceStatus =
  | "WAITING_BOTH"
  | "WAITING_STANDARD"
  | "WAITING_OGF"
  | "WAITING_GCC"
  | "READY";

export const PRICE_STATUS_LABELS: Record<PriceStatus, string> = {
  WAITING_BOTH: "Waiting for required prices",
  WAITING_STANDARD: "Waiting for Standard Price",
  WAITING_OGF: "Waiting for OGF Price",
  WAITING_GCC: "Waiting for GCC Price",
  READY: "Price Updated",
};

type DecimalLike = string | number | { toString(): string };

function normalizeDecimal(value: DecimalLike) {
  const [whole, fraction = ""] = value.toString().trim().split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(6, "0").slice(0, 6)}`;
}

function decimalsEqual(a: DecimalLike | null, b: DecimalLike | null) {
  if (a === null || b === null) return false;
  return normalizeDecimal(a) === normalizeDecimal(b);
}

export function getStandardPriceTally(request: {
  standardPrice: DecimalLike;
  erpStandardPrice: DecimalLike | null;
}) {
  if (request.erpStandardPrice === null) return "WAITING";
  return decimalsEqual(request.standardPrice, request.erpStandardPrice)
    ? "MATCHED"
    : "DIFFERENT";
}

export function getOgfPriceTally(request: {
  ogfPrice: DecimalLike | null;
  erpOgfPrice: DecimalLike | null;
}) {
  if (request.ogfPrice === null) return "NOT_REQUIRED";
  if (request.erpOgfPrice === null) return "WAITING";
  return decimalsEqual(request.ogfPrice, request.erpOgfPrice)
    ? "MATCHED"
    : "DIFFERENT";
}

export function getGccPriceTally(request: {
  gccPrice: DecimalLike | null;
  erp2GccPrice: DecimalLike | null;
}) {
  if (request.gccPrice === null) return "NOT_REQUIRED";
  if (request.erp2GccPrice === null) return "WAITING";
  return decimalsEqual(request.gccPrice, request.erp2GccPrice)
    ? "MATCHED"
    : "DIFFERENT";
}

export function getPriceStatus(request: {
  ogfPrice: DecimalLike | null;
  gccPrice: DecimalLike | null;
  erpStandardPrice: DecimalLike | null;
  erpOgfPrice: DecimalLike | null;
  erp2GccPrice: DecimalLike | null;
}): PriceStatus {
  const standardExists = request.erpStandardPrice !== null;
  const ogfRequired = request.ogfPrice !== null;
  const gccRequired = request.gccPrice !== null;
  const ogfExists = request.erpOgfPrice !== null;
  const gccExists = request.erp2GccPrice !== null;

  if (!standardExists && ((ogfRequired && !ogfExists) || (gccRequired && !gccExists))) return "WAITING_BOTH";
  if (!standardExists) return "WAITING_STANDARD";
  if (ogfRequired && !ogfExists) return "WAITING_OGF";
  if (gccRequired && !gccExists) return "WAITING_GCC";
  return "READY";
}
