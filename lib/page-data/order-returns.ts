import { prisma } from "@/lib/prisma";

export type ReturnTrackingItem = {
  id: string;
  orderId: string;
  invoiceNo: string;
  merchant: { id: string; name: string | null; email: string | null } | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingService: string;
  dispatchedAt: string;
  returnDate: string;
  createdAt: string;
  returnedBy: { id: string; name: string | null; email: string | null } | null;
  dayCount: number;
  actionDate: string | null;
  actionRemark: string | null;
  actionStatus: "pending" | "solved";
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
  if (order.customer?.firstName || order.customer?.lastName) {
    return [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim();
  }
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const shipping = order.shippingAddress as Record<string, unknown>;
    const raw = shipping.name ?? [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim();
    if (typeof raw === "string" && raw.trim()) return raw.trim();
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
    const rows = await prisma.orderReturn.findMany({
      where: {
        companyId: input.companyId,
        ...(input.canManage ? {} : { merchantUserId: input.viewerUserId }),
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
        actionStatus: true,
        actionRemark: true,
        actionDate: true,
        returnedBy: { select: { id: true, name: true, email: true } },
        merchantUser: { select: { id: true, name: true, email: true } },
        order: {
          select: {
            orderNumber: true,
            name: true,
            shopifyOrderId: true,
            customerEmail: true,
            customerPhone: true,
            shippingAddress: true,
            customer: { select: { firstName: true, lastName: true } },
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
      merchant: item.merchantUser,
      customerName: pickCustomerName({
        customer: item.order.customer,
        shippingAddress: item.order.shippingAddress,
        name: item.order.name,
      }),
      customerEmail: item.order.customerEmail,
      customerPhone: item.order.customerPhone,
      shippingService: item.shippingServiceName,
      dispatchedAt: item.dispatchedAt.toISOString(),
      returnDate: item.returnDate.toISOString(),
      createdAt: item.createdAt.toISOString(),
      returnedBy: item.returnedBy,
      dayCount: Math.max(0, Math.ceil((item.returnDate.getTime() - item.dispatchedAt.getTime()) / 86_400_000)),
      actionDate: item.actionDate?.toISOString() ?? null,
      actionRemark: item.actionRemark,
      actionStatus: item.actionStatus,
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
