import "server-only";

import { Prisma, type DeliveryPaymentMethod, type ErpnextInstance, type FulfillmentStage } from "@prisma/client";

import { getFinancePaymentApprovalBlockReason } from "@/lib/approval-workflow";
import {
  isAllowedCompanyErpPaymentMode,
  listErpPaymentModesFromInstance,
  type ErpPaymentModeOption,
} from "@/lib/erp-payment-modes";
import { getErpConfig, resolveOrderPaymentMop } from "@/lib/erpnext-sync";
import { formatInvoiceOrderReference } from "@/lib/fulfillment-order-reference";
import { formatAppIsoCalendarDate, parseAppCalendarDayEnd, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { cashAmountFromDeliveryPayment } from "@/lib/mobile/payment-lines";
import { resolveOrderDisplayTotal } from "@/lib/order-shipping-display";
import { prisma } from "@/lib/prisma";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type CashGroupInput = {
  erpnextCompany: string | null;
  locationName: string;
  /** Precomputed cash. When set, this wins over `payment`. */
  cashAmount?: Prisma.Decimal | number | string | null;
  payment: {
    paymentMethod: DeliveryPaymentMethod;
    collectedAmount: Prisma.Decimal | number | string;
    lines?: Array<{ paymentMethod: DeliveryPaymentMethod; amount: Prisma.Decimal | number | string }>;
  } | null;
};

export type CompanyCashLine = {
  companyName: string;
  cashAmount: string;
};

const PREPAID_GATEWAY = ["koko", "mintpay", "webxpay", "cc checkout", "bank", "card", "visa", "master"];

/** Order was placed as cash/COD, not a prepaid gateway. */
export function isCashHandoverGateway(
  primary: string | null | undefined,
  names: string[] | null | undefined,
): boolean {
  const values = [primary, ...(names ?? [])]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  if (values.length === 0) return false;
  if (values.some((value) => PREPAID_GATEWAY.some((token) => value.includes(token)))) return false;
  return values.some(
    (value) =>
      value === "cash" ||
      value === "manual" ||
      value.includes("cod") ||
      value.includes("cash on delivery"),
  );
}

function decimalText(value: Prisma.Decimal | number | string | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

/**
 * Cash the rider must hand over.
 * Deliveries are closed from the rider link, so there is no mobile collection.
 * A cash/COD order uses the order amount including shipping. Prepaid gateways stay at 0.
 */
export function handoverCashAmount(input: {
  totalPrice: Prisma.Decimal | number | string | null;
  subtotalPrice?: Prisma.Decimal | number | string | null;
  totalShipping?: Prisma.Decimal | number | string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames?: string[] | null;
}): Prisma.Decimal {
  if (!isCashHandoverGateway(input.paymentGatewayPrimary, input.paymentGatewayNames)) {
    return new Prisma.Decimal(0);
  }
  const totalPrice = decimalText(input.totalPrice);
  if (totalPrice == null) return new Prisma.Decimal(0);
  const amount = resolveOrderDisplayTotal({
    totalPrice,
    subtotalSale: decimalText(input.subtotalPrice),
    totalShipping: decimalText(input.totalShipping),
  });
  const total = new Prisma.Decimal(amount);
  return total.gt(0) ? total : new Prisma.Decimal(0);
}

export function handoverCompanyName(
  erpnextCompany: string | null | undefined,
  locationName: string | null | undefined,
): string {
  const company = erpnextCompany?.trim();
  if (company) return company;
  const location = locationName?.trim();
  if (location) return location;
  return "Unknown";
}

export function groupCashByErpCompany(rows: CashGroupInput[]): {
  companies: CompanyCashLine[];
  fullTotal: string;
} {
  const totals = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    const cash =
      row.cashAmount != null
        ? new Prisma.Decimal(row.cashAmount.toString())
        : row.payment
          ? cashAmountFromDeliveryPayment(row.payment)
          : new Prisma.Decimal(0);
    if (cash.lte(0)) continue;
    const name = handoverCompanyName(row.erpnextCompany, row.locationName);
    totals.set(name, (totals.get(name) ?? new Prisma.Decimal(0)).add(cash));
  }
  const companies = Array.from(totals.entries())
    .map(([companyName, amount]) => ({
      companyName,
      cashAmount: amount.toFixed(2),
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
  const fullTotal = companies
    .reduce((sum, line) => sum.add(new Prisma.Decimal(line.cashAmount)), new Prisma.Decimal(0))
    .toFixed(2);
  return { companies, fullTotal };
}

export function receiptDuplicateDecision<T extends { id: string }>(input: {
  existing: T | null;
  confirmDuplicate: boolean;
}): { action: "create" } | { action: "reject"; existing: T } {
  if (input.existing && !input.confirmDuplicate) {
    return { action: "reject", existing: input.existing };
  }
  return { action: "create" };
}

/**
 * A money-received mark covers a summary when the periods overlap.
 * Day 1–day 2 handover still shows on a later day 2 summary.
 */
export function handoverReceiptOverlaps(input: {
  receiptFrom: string;
  receiptTo: string;
  from: string;
  to: string;
}): boolean {
  return input.receiptFrom <= input.to && input.receiptTo >= input.from;
}

/** Invoice-complete deliveries stay off the company cash and the full total. */
export function handoverSummaryCashAmount(delivery: {
  cashAmount: string;
  invoiceCompleteAt: Date | string | null;
  fulfillmentStage: string;
}): string {
  if (isInvoiceClosed(delivery)) return "0.00";
  return delivery.cashAmount;
}

export type HandoverClosedInvoice = {
  orderNumber: string;
  companyName: string;
  invoiceCompleteAt: string | null;
};

export function listHandoverClosedInvoices(
  deliveries: Array<{
    orderNumber: string;
    erpnextCompany: string | null;
    locationName: string;
    invoiceCompleteAt: Date | null;
    fulfillmentStage: string;
  }>,
): HandoverClosedInvoice[] {
  return deliveries.flatMap((delivery) => {
    if (!isInvoiceClosed(delivery)) return [];
    return [
      {
        orderNumber: delivery.orderNumber,
        companyName: handoverCompanyName(delivery.erpnextCompany, delivery.locationName),
        invoiceCompleteAt: delivery.invoiceCompleteAt?.toISOString() ?? null,
      },
    ];
  });
}

/** Shopify number plus ERP invoice when both exist. Shopify order_number alone is only half the reference. */
export function handoverOrderNumber(order: {
  id?: string;
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId?: string | null;
  sourceName?: string | null;
}): string {
  return formatInvoiceOrderReference(order).primary;
}

export function isInvoiceClosed(order: {
  invoiceCompleteAt: Date | string | null;
  fulfillmentStage: string;
}): boolean {
  return order.invoiceCompleteAt != null || order.fulfillmentStage === "invoice_complete";
}

export function shouldCommitInvoiceComplete(
  outcome: "created" | "already_paid" | "skipped" | "error",
): boolean {
  return outcome === "created" || outcome === "already_paid";
}

export function parseHandoverRange(
  fromRaw: string,
  toRaw: string,
): { fromYmd: string; toYmd: string; from: Date; to: Date } | null {
  if (!YMD.test(fromRaw) || !YMD.test(toRaw) || toRaw < fromRaw) return null;
  const from = parseAppCalendarDayStart(fromRaw);
  const to = parseAppCalendarDayEnd(toRaw);
  if (!from || !to || to < from) return null;
  return { fromYmd: fromRaw, toYmd: toRaw, from, to };
}

export function handoverPeriodDates(fromYmd: string, toYmd: string): {
  periodFrom: Date;
  periodTo: Date;
} {
  return {
    periodFrom: new Date(`${fromYmd}T00:00:00.000Z`),
    periodTo: new Date(`${toYmd}T00:00:00.000Z`),
  };
}

export type HandoverDelivery = {
  orderId: string;
  orderNumber: string;
  orderName: string | null;
  ref: string;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
  erpnextInvoiceId: string | null;
  fulfillmentStage: FulfillmentStage;
  invoiceCompleteAt: Date | null;
  erpnextCompany: string | null;
  locationName: string;
  erpInstance: ErpnextInstance | null;
  courierServiceName: string | null;
  paymentMethod: DeliveryPaymentMethod | null;
  collectedAmount: string;
  cashAmount: string;
  payment: CashGroupInput["payment"];
};

export type HandoverLoadResult =
  | { ok: true; riderId: string; riderName: string; deliveries: HandoverDelivery[] }
  | { ok: false; error: "invalid_range" | "rider_not_found" };

function collectedAmountLabel(payment: CashGroupInput["payment"]): string {
  if (!payment) return "0.00";
  if (payment.lines && payment.lines.length > 0) {
    return payment.lines
      .reduce((sum, line) => sum.add(new Prisma.Decimal(line.amount.toString())), new Prisma.Decimal(0))
      .toFixed(2);
  }
  return new Prisma.Decimal(payment.collectedAmount.toString()).toFixed(2);
}

export async function loadRiderHandoverDeliveries(input: {
  companyId: string;
  riderId: string;
  fromYmd: string;
  toYmd: string;
}): Promise<HandoverLoadResult> {
  const range = parseHandoverRange(input.fromYmd, input.toYmd);
  if (!range) return { ok: false, error: "invalid_range" };

  const rider = await prisma.user.findFirst({
    where: {
      id: input.riderId,
      companyId: input.companyId,
      employeeProfile: { is: { isRider: true } },
    },
    select: { id: true, name: true, knownName: true },
  });
  if (!rider) return { ok: false, error: "rider_not_found" };

  const tasks = await prisma.riderDeliveryTask.findMany({
    where: {
      riderId: rider.id,
      status: "completed",
      completedAt: { gte: range.from, lte: range.to },
      order: { companyId: input.companyId },
    },
    orderBy: { completedAt: "asc" },
    select: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          name: true,
          sourceName: true,
          shopifyOrderId: true,
          totalPrice: true,
          subtotalPrice: true,
          totalShipping: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          erpnextInvoiceId: true,
          fulfillmentStage: true,
          invoiceCompleteAt: true,
          companyLocation: {
            select: {
              name: true,
              erpnextCompany: true,
              erpnextInstance: true,
            },
          },
          dispatchedByCourierService: { select: { name: true } },
          deliveryPayment: {
            select: {
              paymentMethod: true,
              collectedAmount: true,
              lines: { select: { paymentMethod: true, amount: true } },
            },
          },
        },
      },
    },
  });

  const deliveries: HandoverDelivery[] = tasks.map((task) => {
    const order = task.order;
    const payment = order.deliveryPayment
      ? {
          paymentMethod: order.deliveryPayment.paymentMethod,
          collectedAmount: order.deliveryPayment.collectedAmount,
          lines: order.deliveryPayment.lines,
        }
      : null;
    const orderNumber = handoverOrderNumber(order);
    const cashAmount = handoverCashAmount({
      totalPrice: order.totalPrice,
      subtotalPrice: order.subtotalPrice,
      totalShipping: order.totalShipping,
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames,
    });
    return {
      orderId: order.id,
      orderNumber,
      orderName: order.name,
      ref: orderNumber,
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames ?? [],
      erpnextInvoiceId: order.erpnextInvoiceId,
      fulfillmentStage: order.fulfillmentStage,
      invoiceCompleteAt: order.invoiceCompleteAt,
      erpnextCompany: order.companyLocation.erpnextCompany,
      locationName: order.companyLocation.name,
      erpInstance: order.companyLocation.erpnextInstance,
      courierServiceName: order.dispatchedByCourierService?.name ?? null,
      paymentMethod: order.deliveryPayment?.paymentMethod ?? null,
      collectedAmount: collectedAmountLabel(payment),
      cashAmount: cashAmount.toFixed(2),
      payment,
    };
  });

  return {
    ok: true,
    riderId: rider.id,
    riderName: rider.knownName?.trim() || rider.name?.trim() || "Rider",
    deliveries,
  };
}

export type HandoverOrderView = {
  orderId: string;
  orderNumber: string;
  ref: string;
  companyName: string;
  cashAmount: string;
  collectedAmount: string;
  paymentMethod: string | null;
  paymentGatewayPrimary: string | null;
  invoiceClosed: boolean;
  fulfillmentStage: string;
  eligible: boolean;
  canEditPaymentType: boolean;
  invoiceCompleteAt: string | null;
  blockReason: string | null;
  modes: ErpPaymentModeOption[];
  selectedMop: string | null;
};

export async function buildHandoverOrders(deliveries: HandoverDelivery[]): Promise<HandoverOrderView[]> {
  const views: HandoverOrderView[] = [];
  for (const delivery of deliveries) {
    const modes = listErpPaymentModesFromInstance(delivery.erpInstance);
    const cfg = delivery.erpInstance ? getErpConfig(delivery.erpInstance) : null;
    const mapped = cfg
      ? resolveOrderPaymentMop(cfg, delivery.paymentGatewayPrimary, delivery.paymentGatewayNames, {
          courierServiceName: delivery.courierServiceName,
        })
      : null;
    const selectedMop = mapped && isAllowedCompanyErpPaymentMode(modes, mapped) ? mapped : null;
    const invoiceClosed = isInvoiceClosed(delivery);
    let eligible = true;
    let blockReason: string | null = null;
    let financeBlock: string | null = null;
    if (invoiceClosed) {
      eligible = false;
      blockReason = "Already invoice complete";
    } else if (delivery.fulfillmentStage !== "delivery_complete") {
      eligible = false;
      blockReason = "Delivery is not complete";
    } else if (modes.length === 0) {
      eligible = false;
      blockReason = "No payment types for this company";
    } else {
      financeBlock = await getFinancePaymentApprovalBlockReason({
        id: delivery.orderId,
        paymentGatewayPrimary: delivery.paymentGatewayPrimary,
        paymentGatewayNames: delivery.paymentGatewayNames,
        erpnextInvoiceId: delivery.erpnextInvoiceId,
      });
      if (financeBlock) {
        eligible = false;
        blockReason = financeBlock;
      }
    }
    const canEditPaymentType = eligible;
    views.push({
      orderId: delivery.orderId,
      orderNumber: delivery.orderNumber,
      ref: delivery.ref,
      companyName: handoverCompanyName(delivery.erpnextCompany, delivery.locationName),
      cashAmount: delivery.cashAmount,
      collectedAmount: delivery.collectedAmount,
      paymentMethod: delivery.paymentMethod,
      paymentGatewayPrimary: delivery.paymentGatewayPrimary,
      invoiceClosed,
      fulfillmentStage: delivery.fulfillmentStage,
      eligible,
      canEditPaymentType,
      invoiceCompleteAt: delivery.invoiceCompleteAt?.toISOString() ?? null,
      blockReason,
      modes,
      selectedMop,
    });
  }
  return views;
}

export type StoredReceiptView = {
  id: string;
  periodFrom: string;
  periodTo: string;
  receivedAt: string;
  receivedByName: string;
  companies: CompanyCashLine[];
  fullTotal: string;
};

export function toStoredReceiptView(receipt: {
  id: string;
  periodFrom: Date;
  periodTo: Date;
  receivedAt: Date;
  fullTotal: Prisma.Decimal | number | string;
  companyTotals: Prisma.JsonValue;
  receivedBy: { name: string | null; knownName: string | null };
}): StoredReceiptView {
  const companies = Array.isArray(receipt.companyTotals)
    ? receipt.companyTotals.flatMap((line) => {
        if (!line || typeof line !== "object") return [];
        const row = line as { companyName?: unknown; cashAmount?: unknown };
        if (typeof row.companyName !== "string" || typeof row.cashAmount !== "string") return [];
        return [{ companyName: row.companyName, cashAmount: row.cashAmount }];
      })
    : [];
  return {
    id: receipt.id,
    periodFrom: formatAppIsoCalendarDate(receipt.periodFrom),
    periodTo: formatAppIsoCalendarDate(receipt.periodTo),
    receivedAt: receipt.receivedAt.toISOString(),
    receivedByName: receipt.receivedBy.knownName?.trim() || receipt.receivedBy.name?.trim() || "Staff",
    companies,
    fullTotal: new Prisma.Decimal(receipt.fullTotal.toString()).toFixed(2),
  };
}

export async function latestHandoverReceipt(input: {
  companyId: string;
  riderId: string;
  fromYmd: string;
  toYmd: string;
}): Promise<StoredReceiptView | null> {
  const dates = handoverPeriodDates(input.fromYmd, input.toYmd);
  const receipt = await prisma.riderFinanceCashReceipt.findFirst({
    where: {
      companyId: input.companyId,
      riderId: input.riderId,
      periodFrom: dates.periodFrom,
      periodTo: dates.periodTo,
    },
    orderBy: { receivedAt: "desc" },
    include: { receivedBy: { select: { name: true, knownName: true } } },
  });
  return receipt ? toStoredReceiptView(receipt) : null;
}

/** Receipts whose period overlaps this summary, newest first. */
export async function handoverReceiptsCovering(input: {
  companyId: string;
  riderId: string;
  fromYmd: string;
  toYmd: string;
}): Promise<StoredReceiptView[]> {
  const dates = handoverPeriodDates(input.fromYmd, input.toYmd);
  const receipts = await prisma.riderFinanceCashReceipt.findMany({
    where: {
      companyId: input.companyId,
      riderId: input.riderId,
      periodFrom: { lte: dates.periodTo },
      periodTo: { gte: dates.periodFrom },
    },
    orderBy: { receivedAt: "desc" },
    include: { receivedBy: { select: { name: true, knownName: true } } },
  });
  return receipts.map(toStoredReceiptView);
}
