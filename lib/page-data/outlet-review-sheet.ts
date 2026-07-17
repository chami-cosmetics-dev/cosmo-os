import { prisma } from "@/lib/prisma";
import {
  getOutletsByCompanyId,
  getUserOutlets,
  getOutletReview,
  supportsOutlets,
} from "@/lib/outlet-utils";
import { applyMerchantGroup, getMerchantGroupUserMap } from "@/lib/merchant-groups";

export type OutletReviewItem = {
  reviewId: string | null;
  orderId: string;
  outletId: string;
  outletName: string;
  merchantName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  erpnextInvoiceId: string | null;
  orderLabel: string;
  orderCreatedAt: string;
  productNames: string[];
  couponCode: string | null;
  reviewRequested: string;
  reviewCollected: string;
  remarks: string;
};

export type OutletOption = {
  id: string;
  name: string;
};

export type OutletReviewSheetData = {
  outlets: OutletOption[];
  reviews: OutletReviewItem[];
  userOutletIds: string[];
};

function extractCouponCodes(discountCodes: unknown): string[] {
  if (!Array.isArray(discountCodes)) return [];
  return discountCodes
    .map((d: unknown) => {
      if (d && typeof d === "object" && "code" in d && typeof (d as { code: unknown }).code === "string") {
        return (d as { code: string }).code;
      }
      return null;
    })
    .filter((c): c is string => c !== null);
}

function pickCustomerName(order: {
  customer?: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: unknown;
  name: string | null;
}): string | null {
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const s = order.shippingAddress as Record<string, unknown>;
    const raw = s.name ?? [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  if (order.customer?.firstName || order.customer?.lastName) {
    return [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim() || null;
  }
  return order.name;
}

export async function fetchOutletReviewSheetData(input: {
  companyId: string;
  viewerUserId: string;
  canReadAll: boolean;
  outletId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<OutletReviewSheetData> {
  if (!supportsOutlets()) {
    return { outlets: [], reviews: [], userOutletIds: [] };
  }

  const allOutlets = input.canReadAll
    ? await getOutletsByCompanyId(input.companyId)
    : await getUserOutlets(input.viewerUserId, input.companyId);

  const userOutletIds = allOutlets.map((o) => o.id);

  const filteredOutlets =
    input.outletId ? allOutlets.filter((o) => o.id === input.outletId) : allOutlets;

  if (filteredOutlets.length === 0) {
    return { outlets: allOutlets.map((o) => ({ id: o.id, name: o.name })), reviews: [], userOutletIds };
  }

  // Build coupon code -> outlet map
  const userToGroup = await getMerchantGroupUserMap(input.companyId);
  const couponToOutlet = new Map<string, { outletId: string; outletName: string; merchantName: string | null }>();
  for (const outlet of filteredOutlets) {
    for (const assignment of outlet.users) {
      const userName = assignment.user.knownName ?? assignment.user.name ?? null;
      const merchant = userName
        ? applyMerchantGroup({ id: assignment.user.id, name: userName }, userToGroup)
        : null;
      for (const code of assignment.couponCodes) {
        if (code) {
          couponToOutlet.set(code.toUpperCase(), {
            outletId: outlet.id,
            outletName: outlet.name,
            merchantName: merchant?.name ?? null,
          });
        }
      }
    }
  }

  if (couponToOutlet.size === 0) {
    return { outlets: allOutlets.map((o) => ({ id: o.id, name: o.name })), reviews: [], userOutletIds };
  }

  const startDateObj = input.startDate ? new Date(input.startDate) : null;
  const endDateObj = input.endDate ? new Date(input.endDate) : null;
  if (endDateObj) endDateObj.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: {
      companyId: input.companyId,
      ...(startDateObj || endDateObj
        ? { createdAt: { ...(startDateObj ? { gte: startDateObj } : {}), ...(endDateObj ? { lte: endDateObj } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true,
      name: true,
      erpnextInvoiceId: true,
      createdAt: true,
      customerPhone: true,
      discountCodes: true,
      shippingAddress: true,
      assignedMerchant: { select: { id: true, name: true, knownName: true } },
      customer: { select: { firstName: true, lastName: true } },
      lineItems: {
        select: {
          productItem: { select: { productTitle: true } },
        },
      },
    },
  });

  // Filter orders whose coupon codes match any outlet user's coupon codes
  const matched: Array<{
    order: (typeof orders)[0];
    outletId: string;
    outletName: string;
    merchantName: string | null;
    matchedCode: string;
  }> = [];

  for (const order of orders) {
    const codes = extractCouponCodes(order.discountCodes);
    for (const code of codes) {
      const outlet = couponToOutlet.get(code.toUpperCase());
      if (outlet) {
        matched.push({ order, ...outlet, matchedCode: code });
        break;
      }
    }
  }

  // Fetch review records
  const reviewMap = new Map<string, { id: string; reviewRequested: string | null; reviewCollected: string | null; remarks: string | null }>();
  await Promise.all(
    matched.map(async ({ order }) => {
      const review = await getOutletReview(order.id);
      if (review) reviewMap.set(order.id, review);
    })
  );

  const reviews: OutletReviewItem[] = matched.map(({ order, outletId, outletName, merchantName, matchedCode }) => {
    const review = reviewMap.get(order.id);
    const merchant = order.assignedMerchant as { id: string; name: string | null; knownName?: string | null } | null;
    return {
      reviewId: review?.id ?? null,
      orderId: order.id,
      outletId,
      outletName,
      merchantName: merchantName ?? merchant?.knownName ?? merchant?.name ?? null,
      customerName: pickCustomerName({ customer: order.customer, shippingAddress: order.shippingAddress, name: order.name }),
      customerPhone: order.customerPhone,
      erpnextInvoiceId: order.erpnextInvoiceId,
      orderLabel: order.name ?? order.id,
      orderCreatedAt: order.createdAt.toISOString(),
      productNames: order.lineItems
        .map((li) => li.productItem?.productTitle ?? "")
        .filter(Boolean),
      couponCode: matchedCode,
      reviewRequested: review?.reviewRequested ?? "",
      reviewCollected: review?.reviewCollected ?? "",
      remarks: review?.remarks ?? "",
    };
  });

  return {
    outlets: allOutlets.map((o) => ({ id: o.id, name: o.name })),
    reviews,
    userOutletIds,
  };
}
