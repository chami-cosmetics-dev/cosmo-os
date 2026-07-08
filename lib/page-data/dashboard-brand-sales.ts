import type { Prisma } from "@prisma/client";

import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import { prisma } from "@/lib/prisma";

export type BrandMerchantRow = {
  merchantId: string | null;
  merchantName: string;
  total: number;
};

export type BrandSalesRow = {
  brand: string;
  total: number;
  merchants: BrandMerchantRow[];
};

export type BrandConfig = {
  id: string;
  name: string;
  isSelected: boolean;
  sortOrder: number;
};

export type DashboardBrandSalesResult = {
  brands: BrandSalesRow[];
  otherBrands: BrandSalesRow;
  brandConfigs: BrandConfig[];
  invalidRange: boolean;
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function getUserDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
} | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || null;
}

/**
 * Aggregates order line item totals grouped by brand × merchant for the dashboard.
 *
 * Brand is determined by case-insensitive substring match of the configured brand
 * name against the product title. Merchant is identified by matching discount codes
 * in the order against staff member coupon codes. Unmatched orders go under "DM-General".
 */
export async function fetchDashboardBrandSales(
  companyId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType: "order" | "completed";
    locationId?: string;
  },
): Promise<DashboardBrandSalesResult> {
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);

  if (fromDate > toDate) {
    return {
      brands: [],
      otherBrands: { brand: "Other Brands", total: 0, merchants: [] },
      brandConfigs: [],
      invalidRange: true,
    };
  }

  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType: params.dateType,
  });

  const orderWhere: Prisma.OrderWhereInput = {
    companyId,
    ...dateFilter,
    ...(params.locationId ? { companyLocationId: params.locationId } : {}),
  };

  // Run all queries in parallel
  const [brandConfigs, usersWithCoupons, orders] = await Promise.all([
    prisma.dashboardBrandConfig.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isSelected: true, sortOrder: true },
    }),

    // Fetch all users in the company that have coupon codes
    prisma.user.findMany({
      where: { companyId, couponCodes: { isEmpty: false } },
      select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    }),

    // Fetch orders with their discount codes and line items
    prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryOutcome: true,
        deliveryCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
        assignedMerchantId: true,
        assignedMerchant: {
          select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
        },
        lineItems: {
          select: {
            price: true,
            quantity: true,
            productItem: {
              select: { productTitle: true },
            },
          },
        },
      },
    }),
  ]);

  // Build a coupon-code → user map (upper-cased for matching)
  // A single coupon code is unique to one staff member
  const couponToUser = new Map<string, { id: string; name: string }>();
  for (const user of usersWithCoupons) {
    const name = getUserDisplayName(user) ?? "Unknown";
    for (const code of user.couponCodes) {
      const normalized = code.trim().toLowerCase();
      if (normalized && !couponToUser.has(normalized)) {
        couponToUser.set(normalized, { id: user.id, name });
      }
    }
  }

  // brandName (lower) → merchantKey → total accumulator
  const brandMap = new Map<string, Map<string, { merchantId: string | null; merchantName: string; total: number }>>();
  // otherBrands → merchantKey → total
  const otherMap = new Map<string, { merchantId: string | null; merchantName: string; total: number }>();

  const configuredBrands = brandConfigs.map((b) => ({ ...b, nameLower: b.name.toLowerCase() }));

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, params.dateType)) continue;

    // Determine merchant for this order
    let merchant: { id: string | null; name: string } | null = null;

    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const merchantCoupons = (merchantCouponCode ?? "")
      .split(",")
      .map((coupon) => coupon.trim().toLowerCase())
      .filter(Boolean);

    for (const code of merchantCoupons) {
      const found = couponToUser.get(code);
      if (found) {
        merchant = { id: found.id, name: found.name };
        break;
      }
    }

    if (!merchant) {
      merchant = {
        id: order.assignedMerchantId,
        name: getUserDisplayName(order.assignedMerchant) ?? "DM-General",
      };
    }

    // Process each line item
    for (const item of order.lineItems) {
      const lineTotal = Number(item.price) * item.quantity;
      const titleLower = (item.productItem?.productTitle ?? "").toLowerCase();

      // Find which configured brand this line item belongs to
      let matchedBrand: string | null = null;
      for (const brand of configuredBrands) {
        if (titleLower.includes(brand.nameLower)) {
          matchedBrand = brand.name;
          break;
        }
      }

      const merchantKey = merchant.id ?? `__${merchant.name}`;

      if (matchedBrand) {
        if (!brandMap.has(matchedBrand)) {
          brandMap.set(matchedBrand, new Map());
        }
        const mMap = brandMap.get(matchedBrand)!;
        const existing = mMap.get(merchantKey);
        if (existing) {
          existing.total += lineTotal;
        } else {
          mMap.set(merchantKey, { merchantId: merchant.id, merchantName: merchant.name, total: lineTotal });
        }
      } else {
        const existing = otherMap.get(merchantKey);
        if (existing) {
          existing.total += lineTotal;
        } else {
          otherMap.set(merchantKey, { merchantId: merchant.id, merchantName: merchant.name, total: lineTotal });
        }
      }
    }
  }

  // Build output rows (only for configured brands that have data or are in config)
  const brandRows: BrandSalesRow[] = configuredBrands.map((b) => {
    const mMap = brandMap.get(b.name) ?? new Map();
    const merchants = [...mMap.values()].sort((a, c) => c.total - a.total);
    const total = merchants.reduce((s, m) => s + m.total, 0);
    return { brand: b.name, total, merchants };
  });

  // Other brands row
  const otherMerchants = [...otherMap.values()].sort((a, b) => b.total - a.total);
  const otherTotal = otherMerchants.reduce((s, m) => s + m.total, 0);

  return {
    brands: brandRows,
    otherBrands: { brand: "Other Brands", total: otherTotal, merchants: otherMerchants },
    brandConfigs: brandConfigs.map((b) => ({
      id: b.id,
      name: b.name,
      isSelected: b.isSelected,
      sortOrder: b.sortOrder,
    })),
    invalidRange: false,
  };
}
