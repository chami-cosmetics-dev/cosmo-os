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
  WAITING_FOR_PRICE: "Awaiting Stock",
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

function decimalsEqual(a: DecimalLike | null | undefined, b: DecimalLike | null | undefined) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return normalizeDecimal(a) === normalizeDecimal(b);
}

export function getStandardPriceTally(request: {
  standardPrice: DecimalLike | null | undefined;
  erpStandardPrice: DecimalLike | null | undefined;
}) {
  if (request.standardPrice === null || request.standardPrice === undefined) return "NOT_REQUIRED";
  if (request.erpStandardPrice === null || request.erpStandardPrice === undefined) return "WAITING";
  return decimalsEqual(request.standardPrice, request.erpStandardPrice)
    ? "MATCHED"
    : "DIFFERENT";
}

export function getOgfPriceTally(request: {
  ogfPrice: DecimalLike | null | undefined;
  erpOgfPrice: DecimalLike | null | undefined;
}) {
  if (request.ogfPrice === null || request.ogfPrice === undefined) return "NOT_REQUIRED";
  if (request.erpOgfPrice === null || request.erpOgfPrice === undefined) return "WAITING";
  return decimalsEqual(request.ogfPrice, request.erpOgfPrice)
    ? "MATCHED"
    : "DIFFERENT";
}

export function getGccPriceTally(request: {
  gccPrice: DecimalLike | null | undefined;
  erp2GccPrice: DecimalLike | null | undefined;
}) {
  if (request.gccPrice === null || request.gccPrice === undefined) return "NOT_REQUIRED";
  if (request.erp2GccPrice === null || request.erp2GccPrice === undefined) return "WAITING";
  return decimalsEqual(request.gccPrice, request.erp2GccPrice)
    ? "MATCHED"
    : "DIFFERENT";
}

export function getPriceStatus(request: {
  ogfPrice: DecimalLike | null | undefined;
  gccPrice: DecimalLike | null | undefined;
  addErp1OgfPrice?: boolean | null | undefined;
  creationSources?: unknown;
  erpStandardPrice: DecimalLike | null | undefined;
  erp1OgfPrice?: DecimalLike | null | undefined;
  erpOgfPrice: DecimalLike | null | undefined;
  erp2GccPrice: DecimalLike | null | undefined;
}): PriceStatus {
  const standardExists = request.erpStandardPrice !== null && request.erpStandardPrice !== undefined;
  const needsErp2 = Array.isArray(request.creationSources) && request.creationSources.includes("ERP2");
  const hasOgfPrice = request.ogfPrice !== null && request.ogfPrice !== undefined;
  const needsErp1Ogf = Boolean(request.addErp1OgfPrice) || (hasOgfPrice && !needsErp2);
  const ogfRequired = needsErp2 && request.ogfPrice !== null && request.ogfPrice !== undefined;
  const gccRequired = needsErp2 && request.gccPrice !== null && request.gccPrice !== undefined;
  const erp1OgfRequired = needsErp1Ogf && request.ogfPrice !== null && request.ogfPrice !== undefined;
  const ogfExists = request.erpOgfPrice !== null && request.erpOgfPrice !== undefined;
  const erp1OgfExists = request.erp1OgfPrice !== null && request.erp1OgfPrice !== undefined;
  const gccExists = request.erp2GccPrice !== null && request.erp2GccPrice !== undefined;

  if (
    !standardExists &&
    ((ogfRequired && !ogfExists) ||
      (erp1OgfRequired && !erp1OgfExists) ||
      (gccRequired && !gccExists))
  ) return "WAITING_BOTH";
  if (!standardExists) return "WAITING_STANDARD";
  if (erp1OgfRequired && !erp1OgfExists) return "WAITING_OGF";
  if (ogfRequired && !ogfExists) return "WAITING_OGF";
  if (gccRequired && !gccExists) return "WAITING_GCC";
  return "READY";
}
