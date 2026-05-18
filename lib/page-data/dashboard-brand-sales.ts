import type { Prisma } from "@prisma/client";

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

/**
 * Extracts coupon/discount codes from an Order.discountCodes JSON field.
 * Shopify stores discount_codes as an array of {code, amount, type} objects,
 * but we also handle plain string arrays and flat strings defensively.
 */
function extractDiscountCodes(discountCodes: Prisma.JsonValue | null): string[] {
  if (!discountCodes) return [];
  const codes: string[] = [];

  function pushCode(val: unknown) {
    if (typeof val === "string") {
      const trimmed = val.trim().toUpperCase();
      if (trimmed) codes.push(trimmed);
    }
  }

  if (Array.isArray(discountCodes)) {
    for (const item of discountCodes) {
      if (typeof item === "string") {
        pushCode(item);
      } else if (item && typeof item === "object" && "code" in item) {
        pushCode((item as { code: unknown }).code);
      }
    }
  } else if (typeof discountCodes === "string") {
    // Comma-separated fallback
    for (const part of discountCodes.split(",")) {
      pushCode(part);
    }
  }

  return codes;
}

/**
 * Aggregates order line item totals grouped by brand × merchant for the dashboard.
 *
 * Brand is determined by case-insensitive substring match of the configured brand
 * name against the product title. Merchant is identified by matching discount codes
 * in the order against staff member coupon codes. Unmatched orders go under "DM General".
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

  const dateFilter: Prisma.OrderWhereInput =
    params.dateType === "order"
      ? { createdAt: { gte: fromDate, lte: toDate } }
      : { invoiceCompleteAt: { not: null, gte: fromDate, lte: toDate } };

  const orderWhere: Prisma.OrderWhereInput = {
    companyId,
    ...dateFilter,
    ...(params.locationId ? { companyLocationId: params.locationId } : {}),
    // Exclude fully cancelled/refunded orders — their line items should not count
    financialStatus: { notIn: ["refunded", "voided"] },
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
      select: { id: true, name: true, couponCodes: true },
    }),

    // Fetch orders with their discount codes and line items
    prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        discountCodes: true,
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
    for (const code of user.couponCodes) {
      const upper = code.trim().toUpperCase();
      if (upper) {
        couponToUser.set(upper, { id: user.id, name: user.name ?? "Unknown" });
      }
    }
  }

  // brandName (lower) → merchantKey → total accumulator
  const brandMap = new Map<string, Map<string, { merchantId: string | null; merchantName: string; total: number }>>();
  // otherBrands → merchantKey → total
  const otherMap = new Map<string, { merchantId: string | null; merchantName: string; total: number }>();

  const configuredBrands = brandConfigs.map((b) => ({ ...b, nameLower: b.name.toLowerCase() }));

  for (const order of orders) {
    // Determine merchant for this order
    const orderCodes = extractDiscountCodes(order.discountCodes);
    let merchant: { id: string | null; name: string } = { id: null, name: "DM General" };
    for (const code of orderCodes) {
      const found = couponToUser.get(code);
      if (found) {
        merchant = { id: found.id, name: found.name };
        break;
      }
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
