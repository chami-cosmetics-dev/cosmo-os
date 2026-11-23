import { prisma } from "@/lib/prisma";
import { formatInvoiceOrderReference } from "@/lib/fulfillment-order-reference";
import { resolveOrderMerchantLabel } from "@/lib/order-merchant-coupon";
import { reconcilePendingApprovalsForErpResolvedOrders } from "@/lib/approval-workflow";
import {
  formatAppIsoDate,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { getReturnRemarkTemplateLabel } from "@/lib/return-remark-templates";
import {
  INVOICE_REVERT_CREDIT_NOTE_TEMPLATE,
  INVOICE_REVERT_STAGE_ONLY_TEMPLATE,
} from "@/lib/invoice-revert";

export type ReturnTrackingItem = {
  id: string;
  orderId: string;
  invoiceNo: string;
  orderName: string | null;
  orderNumber: string | null;
  sourceName: string | null;
  merchant: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
  shippingService: string;
  shippingServiceType: string;
  riderName: string | null;
  shopifyOrderId: string | null;
  erpnextInvoiceId: string | null;
  dispatchedAt: string;
  returnDate: string;
  createdAt: string;
  returnedBy: { id: string; name: string | null; email: string | null } | null;
  dayCount: number;
  actionDate: string | null;
  actionRemark: string | null;
  returnRemark: string | null;
  remarkTemplate: string | null;
  cancelRemark: string | null;
  cancelRequestedAt: string | null;
  actionStatus: "pending" | "solved";
  actionType: string | null;
  revertedFromInvoiceCompleteAt: string | null;
  orderFulfillmentStage: string | null;
};

export type ReturnsTrackingData = {
  returns: ReturnTrackingItem[];
  counts: { all: number; pending: number; solved: number };
};

export type ReturnsReasonStat = {
  code: string;
  label: string;
  count: number;
  pending: number;
  solved: number;
};

export type ReturnsReasonAnalytics = {
  yearMonth: string;
  total: number;
  byReason: ReturnsReasonStat[];
};

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isReturnsYearMonth(value: string): boolean {
  return YEAR_MONTH_RE.test(value);
}

export function currentReturnsYearMonth(now = new Date()): string {
  return formatAppIsoDate(now).slice(0, 7);
}

export function returnsReasonLabel(code: string): string {
  if (code === "unknown") return "Unknown";
  if (code === INVOICE_REVERT_CREDIT_NOTE_TEMPLATE) return "Finance Reverted";
  if (code === INVOICE_REVERT_STAGE_ONLY_TEMPLATE) return "Revert only";
  return getReturnRemarkTemplateLabel(code) ?? code;
}

function monthRangeExclusive(yearMonth: string): { start: Date; end: Date } | null {
  if (!isReturnsYearMonth(yearMonth)) return null;
  const [year, month] = yearMonth.split("-").map(Number);
  const start = parseAppCalendarDayStart(`${yearMonth}-01`);
  if (!start) return null;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = parseAppCalendarDayStart(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  );
  if (!end) return null;
  return { start, end };
}

function pickCustomerName(order: {
  customer?: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: unknown;
  name: string | null;
}) {
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const shipping = order.shippingAddress as Record<string, unknown>;
    const raw = shipping.name ?? [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim();
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  if (order.customer?.firstName || order.customer?.lastName) {
    return [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim();
  }
  return order.name;
}

function isMissingOrderReturnTableError(error: unknown) {
  const meta = error && typeof error === "object" && "meta" in error
    ? (error as { meta?: { modelName?: unknown; table?: unknown } }).meta
    : null;
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2021" &&
      (meta?.modelName === "OrderReturn" || String(meta?.table ?? "").includes("OrderReturn"))
  );
}

export async function fetchReturnsTrackingData(input: {
  companyId: string;
}): Promise<ReturnsTrackingData> {
  try {
    await reconcilePendingApprovalsForErpResolvedOrders(input.companyId);

    // Sweep all pending returns for orders already voided — regardless of actionType.
    // A voided order can't be rearranged or cancelled further, so mark them solved.
    await prisma.orderReturn.updateMany({
      where: {
        companyId: input.companyId,
        actionStatus: "pending",
        order: { financialStatus: { equals: "voided", mode: "insensitive" } },
      },
      data: { actionStatus: "solved", actionDate: new Date() },
    });

    // Anyone with returns.read can see all company returns (not scoped to assigned merchant).
    const rows = await prisma.orderReturn.findMany({
      where: {
        companyId: input.companyId,
      },
      orderBy: [{ returnDate: "desc" }, { createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        orderId: true,
        dispatchedAt: true,
        returnDate: true,
        createdAt: true,
        shippingServiceName: true,
        shippingServiceType: true,
        actionStatus: true,
        actionType: true,
        actionRemark: true,
        returnRemark: true,
        remarkTemplate: true,
        cancelRemark: true,
        cancelRequestedAt: true,
        actionDate: true,
        returnedBy: { select: { id: true, name: true, email: true } },
        rider: { select: { id: true, name: true, mobile: true } },
        merchantUser: { select: { id: true, name: true, email: true } },
        order: {
          select: {
            orderNumber: true,
            name: true,
            shopifyOrderId: true,
            erpnextInvoiceId: true,
            customerEmail: true,
            customerPhone: true,
            financialStatus: true,
            fulfillmentStage: true,
            paymentGatewayPrimary: true,
            paymentGatewayNames: true,
            sourceName: true,
            discountCodes: true,
            shippingAddress: true,
            revertedFromInvoiceCompleteAt: true,
            customer: { select: { firstName: true, lastName: true } },
            assignedMerchant: { select: { name: true, email: true, couponCodes: true } },
          },
        },
      },
    });

    const currentRows = rows.reduce<typeof rows>((acc, item) => {
      if (!acc.some((existing) => existing.orderId === item.orderId)) {
        acc.push(item);
      }
      return acc;
    }, []);

    const returns = currentRows.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      orderName: item.order.name,
      orderNumber: item.order.orderNumber,
      sourceName: item.order.sourceName,
      invoiceNo: formatInvoiceOrderReference({
        name: item.order.name,
        orderNumber: item.order.orderNumber,
        shopifyOrderId: item.order.shopifyOrderId,
        erpnextInvoiceId: item.order.erpnextInvoiceId,
        sourceName: item.order.sourceName,
      }).primary,
      merchant: resolveOrderMerchantLabel({
        assignedMerchant: item.merchantUser ?? item.order.assignedMerchant,
        sourceName: item.order.sourceName,
        discountCodes: item.order.discountCodes,
        assignedMerchantCouponCodes: item.order.assignedMerchant?.couponCodes ?? null,
      }),
      customerName: pickCustomerName({
        customer: item.order.customer,
        shippingAddress: item.order.shippingAddress,
        name: item.order.name,
      }),
      customerEmail: item.order.customerEmail,
      customerPhone: item.order.customerPhone,
      financialStatus: item.order.financialStatus,
      paymentGatewayPrimary: item.order.paymentGatewayPrimary,
      paymentGatewayNames: item.order.paymentGatewayNames,
      shippingService: item.shippingServiceName,
      shippingServiceType: item.shippingServiceType,
      riderName: item.rider?.name ?? item.rider?.mobile ?? null,
      shopifyOrderId: item.order.shopifyOrderId,
      erpnextInvoiceId: item.order.erpnextInvoiceId,
      dispatchedAt: item.dispatchedAt.toISOString(),
      returnDate: item.returnDate.toISOString(),
      createdAt: item.createdAt.toISOString(),
      returnedBy: item.returnedBy,
      dayCount: Math.max(0, Math.ceil((item.returnDate.getTime() - item.dispatchedAt.getTime()) / 86_400_000)),
      actionDate: item.actionDate?.toISOString() ?? null,
      actionRemark: item.actionRemark,
      returnRemark: item.returnRemark ?? item.actionRemark,
      remarkTemplate: item.remarkTemplate,
      cancelRemark: item.cancelRemark,
      cancelRequestedAt: item.cancelRequestedAt?.toISOString() ?? null,
      actionStatus: item.actionStatus,
      actionType: item.actionType,
      revertedFromInvoiceCompleteAt: item.order.revertedFromInvoiceCompleteAt?.toISOString() ?? null,
      orderFulfillmentStage: item.order.fulfillmentStage ?? null,
    }));

    const counts = returns.reduce(
      (acc, item) => {
        acc.all += 1;
        if (item.actionStatus === "solved") acc.solved += 1;
        else acc.pending += 1;
        return acc;
      },
      { all: 0, pending: 0, solved: 0 }
    );

    return { returns, counts };
  } catch (error) {
    if (isMissingOrderReturnTableError(error)) {
      return { returns: [], counts: { all: 0, pending: 0, solved: 0 } };
    }
    throw error;
  }
}

export async function fetchReturnsReasonAnalytics(input: {
  companyId: string;
  yearMonth: string;
}): Promise<ReturnsReasonAnalytics> {
  const yearMonth = isReturnsYearMonth(input.yearMonth)
    ? input.yearMonth
    : currentReturnsYearMonth();
  const range = monthRangeExclusive(yearMonth);
  if (!range) {
    return { yearMonth, total: 0, byReason: [] };
  }

  try {
    const groups = await prisma.orderReturn.groupBy({
      by: ["remarkTemplate", "actionStatus"],
      where: {
        companyId: input.companyId,
        returnDate: { gte: range.start, lt: range.end },
      },
      _count: { _all: true },
    });

    const rolled = new Map<string, ReturnsReasonStat>();
    for (const group of groups) {
      const code = group.remarkTemplate?.trim() || "unknown";
      const existing = rolled.get(code) ?? {
        code,
        label: returnsReasonLabel(code),
        count: 0,
        pending: 0,
        solved: 0,
      };
      const n = group._count._all;
      existing.count += n;
      if (group.actionStatus === "solved") existing.solved += n;
      else existing.pending += n;
      rolled.set(code, existing);
    }

    const byReason = [...rolled.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const total = byReason.reduce((sum, row) => sum + row.count, 0);
    return { yearMonth, total, byReason };
  } catch (error) {
    if (isMissingOrderReturnTableError(error)) {
      return { yearMonth, total: 0, byReason: [] };
    }
    throw error;
  }
}
