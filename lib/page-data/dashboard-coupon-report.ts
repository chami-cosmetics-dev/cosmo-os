import {
  buildWholesaleOwnerMap,
  dashboardMerchantRowKey,
  dashboardMerchantUserSelect,
  dashboardMerchantUserWhere,
  resolveDashboardOrderMerchant,
} from "@/lib/dashboard-order-merchant";
import {
  normalizeDashboardCouponSelection,
  orderMatchesDashboardCoupon,
} from "@/lib/dashboard-coupon-filter";
import {
  buildCouponToMerchantMap,
  getMerchantDisplayName,
  getMerchantGroupUserMap,
} from "@/lib/merchant-groups";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import {
  getDashboardSalesDateTypeLabel,
  type DashboardSalesDateType,
} from "@/lib/page-data/dashboard-overview-shared";
import {
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
  phoneDigitsOnly,
} from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { salesAmountExcludingShipping } from "@/lib/sales-amount-excluding-shipping";

const SHOP_SOURCE_NAMES = new Set(["pos", "erpnext-pos"]);

export type CouponReportChannel = "online" | "shop";

export type CouponReportRowKind =
  | "warehouse_header"
  | "merchant"
  | "warehouse_total"
  | "online_total"
  | "shop_total"
  | "grand_total";

export type CouponReportRow = {
  kind: CouponReportRowKind;
  warehouse: string;
  merchant: string;
  onlineSale: number;
  shopSale: number;
  totalSale: number;
  orderCount: number;
  existingCustomers: number;
  registeredCustomers: number;
};

export type CouponReportOrderInput = {
  locationId: string;
  locationName: string;
  merchantId: string | null;
  merchantName: string;
  isWholesale?: boolean;
  channel: CouponReportChannel;
  amount: number;
  customerKey: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
};

export type CouponReportResult = {
  fromYmd: string;
  toYmd: string;
  dateType: DashboardSalesDateType;
  dateTypeLabel: string;
  couponCodes: string[];
  rows: CouponReportRow[];
  invalidRange: boolean;
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Total sale is always the two rounded channel columns added. */
function saleColumns(online: number, shop: number) {
  const onlineSale = roundMoney(online);
  const shopSale = roundMoney(shop);
  return {
    onlineSale,
    shopSale,
    totalSale: roundMoney(onlineSale + shopSale),
  };
}

export function dashboardCouponSaleChannel(
  sourceName: string | null | undefined,
): CouponReportChannel {
  const normalized = (sourceName ?? "").trim().toLowerCase();
  return SHOP_SOURCE_NAMES.has(normalized) ? "shop" : "online";
}

export function couponReportCustomerKey(order: {
  id: string;
  customerId?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
}): string {
  const customerId = order.customerId?.trim();
  if (customerId) return `id:${customerId}`;
  const phone =
    canonicalPhoneForErpCustomerId(order.customerPhone ?? "") ||
    phoneDigitsOnly(order.customerPhone ?? "") ||
    order.customerPhone?.trim();
  if (phone) return `phone:${phone}`;
  const email = order.customerEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;
  return `order:${order.id}`;
}

function countEngagement(
  keys: Set<string>,
  existingKeys: Set<string>,
  registeredKeys: Set<string>,
) {
  let existingCustomers = 0;
  let registeredCustomers = 0;
  for (const key of keys) {
    if (existingKeys.has(key)) existingCustomers += 1;
    if (registeredKeys.has(key)) registeredCustomers += 1;
  }
  return { existingCustomers, registeredCustomers };
}

function emptyNumericRow(
  kind: CouponReportRowKind,
  warehouse: string,
  merchant: string,
): CouponReportRow {
  return {
    kind,
    warehouse,
    merchant,
    onlineSale: 0,
    shopSale: 0,
    totalSale: 0,
    orderCount: 0,
    existingCustomers: 0,
    registeredCustomers: 0,
  };
}

function merchantRowKey(row: {
  merchantId: string | null;
  merchantName: string;
  isWholesale?: boolean;
}) {
  return dashboardMerchantRowKey({
    id: row.merchantId,
    name: row.merchantName,
    isWholesale: row.isWholesale ?? false,
  });
}

export function aggregateCouponReport(
  orders: CouponReportOrderInput[],
  existingCustomerKeys: Set<string>,
  registeredCustomerKeys: Set<string> = new Set(),
): CouponReportRow[] {
  type MerchantAcc = {
    merchantId: string | null;
    merchantName: string;
    onlineSale: number;
    shopSale: number;
    orderCount: number;
    customers: Set<string>;
  };
  type WarehouseAcc = {
    locationName: string;
    merchants: Map<string, MerchantAcc>;
    customers: Set<string>;
  };

  const warehouses = new Map<string, WarehouseAcc>();
  const grandCustomers = new Set<string>();
  const onlineCustomers = new Set<string>();
  const shopCustomers = new Set<string>();
  let grandOnline = 0;
  let grandShop = 0;
  let grandOnlineOrders = 0;
  let grandShopOrders = 0;

  for (const order of orders) {
    const warehouse =
      warehouses.get(order.locationId) ??
      {
        locationName: order.locationName,
        merchants: new Map<string, MerchantAcc>(),
        customers: new Set<string>(),
      };
    warehouses.set(order.locationId, warehouse);

    const merchantKey = merchantRowKey(order);
    const merchant =
      warehouse.merchants.get(merchantKey) ??
      {
        merchantId: order.merchantId,
        merchantName: order.merchantName,
        onlineSale: 0,
        shopSale: 0,
        orderCount: 0,
        customers: new Set<string>(),
      };
    warehouse.merchants.set(merchantKey, merchant);

    if (order.channel === "shop") {
      merchant.shopSale += order.amount;
      grandShop += order.amount;
      grandShopOrders += 1;
      shopCustomers.add(order.customerKey);
    } else {
      merchant.onlineSale += order.amount;
      grandOnline += order.amount;
      grandOnlineOrders += 1;
      onlineCustomers.add(order.customerKey);
    }
    merchant.orderCount += 1;
    merchant.customers.add(order.customerKey);
    warehouse.customers.add(order.customerKey);
    grandCustomers.add(order.customerKey);
  }

  const rows: CouponReportRow[] = [];
  const sortedWarehouses = [...warehouses.entries()].sort((a, b) =>
    a[1].locationName.localeCompare(b[1].locationName),
  );

  for (const [, warehouse] of sortedWarehouses) {
    const merchantRows = [...warehouse.merchants.values()].sort((a, b) =>
      a.merchantName.localeCompare(b.merchantName),
    );

    rows.push(emptyNumericRow("warehouse_header", warehouse.locationName, ""));

    let warehouseOnline = 0;
    let warehouseShop = 0;
    let warehouseOrders = 0;

    for (const merchant of merchantRows) {
      const counts = countEngagement(
        merchant.customers,
        existingCustomerKeys,
        registeredCustomerKeys,
      );
      rows.push({
        kind: "merchant",
        warehouse: warehouse.locationName,
        merchant: merchant.merchantName,
        ...saleColumns(merchant.onlineSale, merchant.shopSale),
        orderCount: merchant.orderCount,
        existingCustomers: counts.existingCustomers,
        registeredCustomers: counts.registeredCustomers,
      });
      warehouseOnline += merchant.onlineSale;
      warehouseShop += merchant.shopSale;
      warehouseOrders += merchant.orderCount;
    }

    const warehouseCounts = countEngagement(
      warehouse.customers,
      existingCustomerKeys,
      registeredCustomerKeys,
    );
    rows.push({
      kind: "warehouse_total",
      warehouse: warehouse.locationName,
      merchant: "Warehouse total",
      ...saleColumns(warehouseOnline, warehouseShop),
      orderCount: warehouseOrders,
      existingCustomers: warehouseCounts.existingCustomers,
      registeredCustomers: warehouseCounts.registeredCustomers,
    });
  }

  if (rows.length > 0) {
    const onlineSales = saleColumns(grandOnline, 0);
    const shopSales = saleColumns(0, grandShop);
    const onlineCounts = countEngagement(
      onlineCustomers,
      existingCustomerKeys,
      registeredCustomerKeys,
    );
    const shopCounts = countEngagement(
      shopCustomers,
      existingCustomerKeys,
      registeredCustomerKeys,
    );
    const grandCounts = countEngagement(
      grandCustomers,
      existingCustomerKeys,
      registeredCustomerKeys,
    );
    rows.push(
      {
        kind: "online_total",
        warehouse: "All warehouses",
        merchant: "Online total",
        ...onlineSales,
        orderCount: grandOnlineOrders,
        existingCustomers: onlineCounts.existingCustomers,
        registeredCustomers: onlineCounts.registeredCustomers,
      },
      {
        kind: "shop_total",
        warehouse: "All warehouses",
        merchant: "Shop total",
        ...shopSales,
        orderCount: grandShopOrders,
        existingCustomers: shopCounts.existingCustomers,
        registeredCustomers: shopCounts.registeredCustomers,
      },
      {
        kind: "grand_total",
        warehouse: "All warehouses",
        merchant: "Grand total",
        onlineSale: onlineSales.onlineSale,
        shopSale: shopSales.shopSale,
        totalSale: roundMoney(onlineSales.totalSale + shopSales.totalSale),
        orderCount: grandOnlineOrders + grandShopOrders,
        existingCustomers: grandCounts.existingCustomers,
        registeredCustomers: grandCounts.registeredCustomers,
      },
    );
  }

  return rows;
}

export async function loadRegisteredCustomerKeys(
  companyId: string,
  orders: CouponReportOrderInput[],
): Promise<Set<string>> {
  const registered = new Set<string>();
  const phones: string[] = [];
  const emails: string[] = [];
  for (const order of orders) {
    if (order.customerKey.startsWith("id:")) registered.add(order.customerKey);
    if (order.customerPhone?.trim()) phones.push(order.customerPhone.trim());
    const email = order.customerEmail?.trim().toLowerCase();
    if (email) emails.push(email);
  }

  const phoneVariants = [...new Set(phones.flatMap((phone) => buildPhoneLookupVariants(phone)))];
  const uniqueEmails = [...new Set(emails)];
  const or: Array<Record<string, unknown>> = [];
  if (phoneVariants.length > 0) {
    or.push({ phoneNumber: { in: phoneVariants } });
    or.push({ phones: { some: { phoneNumber: { in: phoneVariants } } } });
  }
  if (uniqueEmails.length > 0) {
    or.push({ email: { in: uniqueEmails, mode: "insensitive" } });
    or.push({ emails: { some: { email: { in: uniqueEmails, mode: "insensitive" } } } });
  }
  if (or.length === 0) return registered;

  const contacts = await prisma.contactMaster.findMany({
    where: { companyId, OR: or },
    select: {
      phoneNumber: true,
      email: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  const contactPhones = new Set<string>();
  const contactEmails = new Set<string>();
  for (const contact of contacts) {
    for (const phone of [contact.phoneNumber, ...contact.phones.map((row) => row.phoneNumber)]) {
      if (!phone) continue;
      for (const variant of buildPhoneLookupVariants(phone)) contactPhones.add(variant);
    }
    for (const value of [contact.email, ...contact.emails.map((row) => row.email)]) {
      const email = value?.trim().toLowerCase();
      if (email) contactEmails.add(email);
    }
  }

  for (const order of orders) {
    const phoneHit = order.customerPhone
      ? buildPhoneLookupVariants(order.customerPhone).some((variant) =>
          contactPhones.has(variant),
        )
      : false;
    const emailHit = order.customerEmail
      ? contactEmails.has(order.customerEmail.trim().toLowerCase())
      : false;
    if (phoneHit || emailHit) registered.add(order.customerKey);
  }

  return registered;
}

function customerKeyParts(keys: Set<string>) {
  const customerIds: string[] = [];
  const phones: string[] = [];
  const emails: string[] = [];
  for (const key of keys) {
    if (key.startsWith("id:")) customerIds.push(key.slice(3));
    else if (key.startsWith("phone:")) phones.push(key.slice(6));
    else if (key.startsWith("email:")) emails.push(key.slice(6));
  }
  return { customerIds, phones, emails };
}

export async function fetchDashboardCouponReport(
  companyId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType: DashboardSalesDateType;
    couponCodes?: string | readonly string[] | null;
  },
): Promise<CouponReportResult> {
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  const empty: CouponReportResult = {
    fromYmd: params.fromYmd,
    toYmd: params.toYmd,
    dateType: params.dateType,
    dateTypeLabel: getDashboardSalesDateTypeLabel(params.dateType),
    couponCodes: [],
    rows: [],
    invalidRange: fromDate > toDate,
  };
  if (fromDate > toDate) return empty;

  const where = {
    companyId,
    ...buildDashboardSalesDateFilter({
      fromDate,
      toDate,
      dateType: params.dateType,
    }),
  };

  const [locations, usersWithCoupons, orders] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultMerchantUserId: true,
        defaultMerchant: {
          select: { id: true, knownName: true, name: true, email: true },
        },
      },
    }),
    prisma.user.findMany({
      where: dashboardMerchantUserWhere(companyId),
      select: dashboardMerchantUserSelect,
    }),
    prisma.order.findMany({
      where,
      select: {
        id: true,
        companyLocationId: true,
        assignedMerchantId: true,
        customerId: true,
        customerPhone: true,
        customerEmail: true,
        totalPrice: true,
        totalShipping: true,
        shippingLines: true,
        createdAt: true,
        cancelledAt: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        fulfillmentStageEnteredAt: true,
        deliveryOutcome: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
        assignedMerchant: { select: dashboardMerchantUserSelect },
      },
    }),
  ]);

  const userToGroup = await getMerchantGroupUserMap(companyId);
  const couponToUser = buildCouponToMerchantMap(usersWithCoupons, userToGroup);
  const wholesaleOwners = buildWholesaleOwnerMap(usersWithCoupons);
  const locationMeta = new Map(
    locations.map((loc) => [
      loc.id,
      {
        name: loc.name,
        defaultMerchant: loc.defaultMerchant
          ? {
              id: loc.defaultMerchant.id,
              name: getMerchantDisplayName(loc.defaultMerchant),
            }
          : null,
      },
    ]),
  );

  const mapped: CouponReportOrderInput[] = [];
  const reportCustomerKeys = new Set<string>();

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, params.dateType)) continue;
    if (!orderMatchesDashboardCoupon(order, params.couponCodes)) continue;
    const locMeta = locationMeta.get(order.companyLocationId);
    if (!locMeta) continue;

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
    const resolved = resolveDashboardOrderMerchant({
      orderCoupons: merchantCoupons,
      couponToUser,
      wholesaleOwners,
      assignedMerchantId: order.assignedMerchantId,
      assignedMerchant: order.assignedMerchant,
      userToGroup,
      locationName: locMeta.name,
      locationDefaultMerchant: locMeta.defaultMerchant,
    });

    const customerKey = couponReportCustomerKey(order);
    reportCustomerKeys.add(customerKey);
    mapped.push({
      locationId: order.companyLocationId,
      locationName: locMeta.name,
      merchantId: resolved.id,
      merchantName: resolved.name,
      isWholesale: resolved.isWholesale,
      channel: dashboardCouponSaleChannel(order.sourceName),
      amount: salesAmountExcludingShipping(order) ?? 0,
      customerKey,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
    });
  }

  const { customerIds, phones, emails } = customerKeyParts(reportCustomerKeys);
  const phoneVariants = [
    ...new Set(phones.flatMap((phone) => buildPhoneLookupVariants(phone))),
  ];
  const priorOr = [
    customerIds.length > 0 ? { customerId: { in: customerIds } } : null,
    phoneVariants.length > 0 ? { customerPhone: { in: phoneVariants } } : null,
    emails.length > 0 ? { customerEmail: { in: emails } } : null,
  ].filter((clause): clause is NonNullable<typeof clause> => clause != null);

  const existingCustomerKeys = new Set<string>();
  if (priorOr.length > 0) {
    const priorOrders = await prisma.order.findMany({
      where: {
        companyId,
        createdAt: { lt: fromDate },
        cancelledAt: null,
        NOT: { financialStatus: "voided" },
        OR: priorOr,
      },
      select: {
        id: true,
        customerId: true,
        customerPhone: true,
        customerEmail: true,
      },
    });
    for (const prior of priorOrders) {
      existingCustomerKeys.add(couponReportCustomerKey(prior));
    }
  }

  const registeredCustomerKeys = await loadRegisteredCustomerKeys(companyId, mapped);

  return {
    fromYmd: params.fromYmd,
    toYmd: params.toYmd,
    dateType: params.dateType,
    dateTypeLabel: getDashboardSalesDateTypeLabel(params.dateType),
    couponCodes: normalizeDashboardCouponSelection(params.couponCodes),
    rows: aggregateCouponReport(mapped, existingCustomerKeys, registeredCustomerKeys),
    invalidRange: false,
  };
}
