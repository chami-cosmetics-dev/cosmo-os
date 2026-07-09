import { prisma } from "@/lib/prisma";
import { resolveOrderMerchantLabel } from "@/lib/order-merchant-coupon";

export type ReturnTrackingItem = {
  id: string;
  orderId: string;
  invoiceNo: string;
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
  viewerUserId: string;
  canManage: boolean;
}): Promise<ReturnsTrackingData> {
  try {
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

    const rows = await prisma.orderReturn.findMany({
      where: {
        companyId: input.companyId,
        ...(input.canManage
          ? {}
          : {
              OR: [
                { merchantUserId: input.viewerUserId },
                { merchantUserId: null },
              ],
            }),
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
      invoiceNo: item.order.name ?? item.order.orderNumber ?? item.order.shopifyOrderId,
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
