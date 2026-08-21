import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import {
  matchesMerchantAllocation,
  viewerMerchantLabels,
} from "@/lib/customer-insight/ownership";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { normalizeContactEmail } from "@/lib/contact-identifiers";
import { buildPhoneLookupVariants, phoneDigitsOnly } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import {
  classifyMerchantSalesBucket,
  parseOrderCouponList,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";

export type MerchantSalesLocationRow = {
  locationId: string;
  locationName: string;
  total: number;
  orderCount: number;
};

export type MerchantDashboardSales = {
  total: number;
  orderCount: number;
  byLocation: MerchantSalesLocationRow[];
  /** True when this user holds a DM MER (e.g. MER115) plus personal MER. */
  hasDmSplit: boolean;
  merTotal: number;
  merOrderCount: number;
  dmTotal: number;
  dmOrderCount: number;
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function emptySales(): MerchantDashboardSales {
  return {
    total: 0,
    orderCount: 0,
    byLocation: [],
    hasDmSplit: false,
    merTotal: 0,
    merOrderCount: 0,
    dmTotal: 0,
    dmOrderCount: 0,
  };
}

function orderTrackingCoupons(order: {
  sourceName: string | null;
  discountCodes: unknown;
  rawPayload: unknown;
}): string[] {
  const merchantCouponCode = getMerchantCouponCode({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
    assignedMerchantCouponCodes: null,
    joinAllDiscountCodes: true,
  });
  return parseOrderCouponList(merchantCouponCode);
}

/**
 * MTD (or range) sales for one merchant user.
 * Attribution: coupon match to this user, else assignedMerchantId === userId.
 * DM MER holders also receive orders with no MER code in the DM bucket.
 * Does not collapse merchant groups so individual targets stay personal.
 */
export async function fetchMerchantUserSales(
  companyId: string,
  merchantUserId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType?: DashboardSalesDateType;
  },
): Promise<MerchantDashboardSales> {
  const dateType: DashboardSalesDateType = params.dateType ?? "all_orders";
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return emptySales();
  }

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: { id: true, couponCodes: true },
  });
  if (!merchant) {
    return emptySales();
  }

  const sets = splitMerchantCouponSets(merchant.couponCodes);

  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType,
  });

  const [locations, orders] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        ...dateFilter,
      },
      select: {
        companyLocationId: true,
        assignedMerchantId: true,
        totalPrice: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
      },
    }),
  ]);

  const byLocation = new Map<string, MerchantSalesLocationRow>();
  for (const loc of locations) {
    byLocation.set(loc.id, {
      locationId: loc.id,
      locationName: loc.name,
      total: 0,
      orderCount: 0,
    });
  }

  let merTotal = 0;
  let merOrderCount = 0;
  let dmTotal = 0;
  let dmOrderCount = 0;

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, dateType)) continue;

    const orderCoupons = orderTrackingCoupons(order);
    const bucket = classifyMerchantSalesBucket({
      orderCoupons,
      personal: sets.personal,
      dm: sets.dm,
      hasDm: sets.hasDm,
      assignedToViewer: order.assignedMerchantId === merchantUserId,
    });
    if (!bucket) continue;

    const amount = Number(order.totalPrice ?? 0);
    if (bucket === "dm") {
      dmTotal += amount;
      dmOrderCount += 1;
    } else {
      merTotal += amount;
      merOrderCount += 1;
    }

    const locRow = byLocation.get(order.companyLocationId);
    if (locRow) {
      locRow.total += amount;
      locRow.orderCount += 1;
    }
  }

  const total = merTotal + dmTotal;
  const orderCount = merOrderCount + dmOrderCount;

  return {
    total,
    orderCount,
    byLocation: [...byLocation.values()]
      .filter((row) => row.orderCount > 0)
      .sort((a, b) => b.total - a.total),
    hasDmSplit: sets.hasDm,
    merTotal,
    merOrderCount,
    dmTotal,
    dmOrderCount,
  };
}

export type MerchantTopCustomerRow = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  total: number;
  orderCount: number;
  /** Distinct purchase calendar days (Asia/Colombo) — frequency rank key. */
  purchaseDays: number;
};

export type AllocatedCustomerIdentitySets = {
  phoneDigits: Set<string>;
  emails: Set<string>;
};

/** Build lookup sets from Contact Master rows allocated to this merchant. */
export function buildAllocatedCustomerIdentitySets(
  contacts: Array<{
    phoneNumber?: string | null;
    email?: string | null;
    phones?: Array<{ phoneNumber: string }> | null;
    emails?: Array<{ email: string }> | null;
  }>,
): AllocatedCustomerIdentitySets {
  const phoneDigits = new Set<string>();
  const emails = new Set<string>();

  const addPhone = (raw: string | null | undefined) => {
    if (!raw?.trim()) return;
    for (const variant of buildPhoneLookupVariants(raw)) {
      const digits = phoneDigitsOnly(variant);
      if (digits.length >= 7) phoneDigits.add(digits);
    }
  };
  const addEmail = (raw: string | null | undefined) => {
    const email = normalizeContactEmail(raw);
    if (email?.includes("@")) emails.add(email);
  };

  for (const contact of contacts) {
    addPhone(contact.phoneNumber);
    addEmail(contact.email);
    for (const row of contact.phones ?? []) addPhone(row.phoneNumber);
    for (const row of contact.emails ?? []) addEmail(row.email);
  }

  return { phoneDigits, emails };
}

/** True when order phone/email matches an allocated Contact Master identity. */
export function orderMatchesAllocatedCustomer(
  order: { customerPhone: string | null; customerEmail: string | null },
  allocated: AllocatedCustomerIdentitySets,
): boolean {
  if (order.customerPhone?.trim()) {
    for (const variant of buildPhoneLookupVariants(order.customerPhone)) {
      const digits = phoneDigitsOnly(variant);
      if (digits.length >= 7 && allocated.phoneDigits.has(digits)) return true;
    }
  }
  const email = normalizeContactEmail(order.customerEmail);
  if (email?.includes("@") && allocated.emails.has(email)) return true;
  return false;
}

async function loadAllocatedCustomerIdentitySets(
  companyId: string,
  merchantUser: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
  },
): Promise<AllocatedCustomerIdentitySets> {
  const labels = viewerMerchantLabels(merchantUser);
  if (labels.length === 0) {
    return { phoneDigits: new Set(), emails: new Set() };
  }

  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      OR: labels.map((label) => ({
        assignedMerchant: { equals: label, mode: "insensitive" as const },
      })),
    },
    select: {
      phoneNumber: true,
      email: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
    take: 8_000,
  });

  return buildAllocatedCustomerIdentitySets(contacts);
}

function looksLikeInvoiceOrOrderRef(value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return false;
  // e.g. 800-000025, 900-000354, SI refs — not a person name
  return /^\d{3,}-\d+$/.test(v) || /^#?\d{4,}$/.test(v);
}

function pickPersonName(order: {
  name: string | null;
  shippingAddress: unknown;
  customer?: { firstName: string | null; lastName: string | null } | null;
}): string | null {
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const s = order.shippingAddress as Record<string, unknown>;
    const raw = s.name ?? [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
    if (typeof raw === "string" && raw.trim() && !looksLikeInvoiceOrOrderRef(raw)) {
      return raw.trim();
    }
  }
  if (order.customer?.firstName || order.customer?.lastName) {
    const joined = [order.customer.firstName, order.customer.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (joined) return joined;
  }
  if (order.name?.trim() && !looksLikeInvoiceOrOrderRef(order.name)) {
    return order.name.trim();
  }
  return null;
}

function customerGroupKey(order: {
  customerPhone: string | null;
  customerEmail: string | null;
  customerId: string | null;
}) {
  const phone = (order.customerPhone ?? "").replace(/\D/g, "");
  if (phone.length >= 7) return `p:${phone}`;
  const email = (order.customerEmail ?? "").trim().toLowerCase();
  if (email.includes("@")) return `e:${email}`;
  if (order.customerId) return `c:${order.customerId}`;
  return null;
}

type MerchantOrderForCustomers = {
  totalPrice: unknown;
  name: string | null;
  customerId: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  createdAt: Date;
  shippingAddress: unknown;
  customer?: { firstName: string | null; lastName: string | null } | null;
};

function aggregateTopCustomers(
  orders: MerchantOrderForCustomers[],
  params: {
    limit: number;
    rankBy: "purchaseDays" | "total";
  },
): MerchantTopCustomerRow[] {
  type Acc = MerchantTopCustomerRow & { daySet: Set<string> };
  const byCustomer = new Map<string, Acc>();

  for (const order of orders) {
    const key = customerGroupKey(order);
    if (!key) continue;

    const amount = Number(order.totalPrice ?? 0);
    const day = formatAppIsoDate(order.createdAt);
    const personName = pickPersonName(order);
    const existing = byCustomer.get(key);
    if (existing) {
      existing.total += amount;
      existing.orderCount += 1;
      if (day) existing.daySet.add(day);
      if (
        personName &&
        (looksLikeInvoiceOrOrderRef(existing.name) || existing.name === "Customer")
      ) {
        existing.name = personName;
      }
      if (!existing.phone && order.customerPhone) existing.phone = order.customerPhone;
      if (!existing.email && order.customerEmail) existing.email = order.customerEmail;
    } else {
      const daySet = new Set<string>();
      if (day) daySet.add(day);
      byCustomer.set(key, {
        key,
        name: personName || order.customerPhone || order.customerEmail || "Customer",
        phone: order.customerPhone,
        email: order.customerEmail,
        total: amount,
        orderCount: 1,
        purchaseDays: 0,
        daySet,
      });
    }
  }

  return [...byCustomer.values()]
    .map((row) => ({
      key: row.key,
      name: row.name,
      phone: row.phone,
      email: row.email,
      total: row.total,
      orderCount: row.orderCount,
      purchaseDays: row.daySet.size,
    }))
    .sort((a, b) => {
      if (params.rankBy === "total") {
        if (b.total !== a.total) return b.total - a.total;
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return b.purchaseDays - a.purchaseDays;
      }
      if (b.purchaseDays !== a.purchaseDays) return b.purchaseDays - a.purchaseDays;
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return b.total - a.total;
    })
    .slice(0, params.limit);
}

export type MerchantTopCustomersSplit = {
  today: MerchantTopCustomerRow[];
  lifetime: MerchantTopCustomerRow[];
  todayYmd: string;
};

/**
 * Daily top = today's buyers ranked by today's spend.
 * Lifetime top = all-time buyers ranked by purchase value.
 * Groups by phone/email — never by order name (often an SI number).
 * Attribution matches sales cards: coupon code first, else assignedMerchantId.
 * Only includes customers allocated to this merchant on Contact Master.
 */
export async function fetchMerchantTopCustomersBySales(
  companyId: string,
  merchantUserId: string,
  params?: { limit?: number },
): Promise<MerchantTopCustomersSplit> {
  const limit = params?.limit ?? 10;
  const todayYmd = formatAppIsoDate(new Date());
  const todayStart = parseDayStartUtc(todayYmd);
  const todayEnd = parseDayEndUtc(todayYmd);

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: {
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
    },
  });

  const couponSet = new Set(
    (merchant?.couponCodes ?? [])
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );

  const orderSelect = {
    id: true,
    totalPrice: true,
    name: true,
    customerId: true,
    customerPhone: true,
    customerEmail: true,
    createdAt: true,
    shippingAddress: true,
    assignedMerchantId: true,
    sourceName: true,
    discountCodes: true,
    rawPayload: true,
    customer: { select: { firstName: true, lastName: true } },
    assignedMerchant: { select: { couponCodes: true } },
  } as const;

  const [todayRaw, recentRaw, allocated] = await Promise.all([
    prisma.order.findMany({
      where: {
        companyId,
        cancelledAt: null,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      select: orderSelect,
      take: 5_000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        cancelledAt: null,
      },
      select: orderSelect,
      take: 8_000,
      orderBy: { createdAt: "desc" },
    }),
    loadAllocatedCustomerIdentitySets(companyId, merchant ?? {}),
  ]);

  function isAttributed(order: (typeof recentRaw)[number]) {
    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const orderCoupons = (merchantCouponCode ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    for (const code of orderCoupons) {
      if (couponSet.has(code)) return true;
    }
    return order.assignedMerchantId === merchantUserId;
  }

  const todayAttributed = todayRaw.filter(
    (order) =>
      isAttributed(order) && orderMatchesAllocatedCustomer(order, allocated),
  );

  const byId = new Map<string, (typeof recentRaw)[number]>();
  for (const order of recentRaw) {
    if (!isAttributed(order)) continue;
    if (!orderMatchesAllocatedCustomer(order, allocated)) continue;
    byId.set(order.id, order);
  }
  // Ensure today's attributed orders are included even if outside the recent window.
  for (const order of todayAttributed) {
    byId.set(order.id, order);
  }

  const lifetimeOrders = [...byId.values()];

  return {
    todayYmd,
    today: aggregateTopCustomers(todayAttributed, { limit, rankBy: "total" }),
    lifetime: aggregateTopCustomers(lifetimeOrders, {
      limit,
      rankBy: "total",
    }),
  };
}

export type MerchantDailyInvoiceRow = {
  orderId: string;
  invoiceLabel: string;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  amount: number;
  locationName: string;
  discountCouponCode: string | null;
  merchantCouponCode: string | null;
  allocatedMerchant: string | null;
  allocationMismatch: boolean;
};

export type MerchantDailyInvoicesResult = {
  dayYmd: string;
  total: number;
  orderCount: number;
  rows: MerchantDailyInvoiceRow[];
};

const DAILY_INVOICES_CAP = 500;

/**
 * Daily invoice list for one merchant.
 * Attribution: coupon match first, else assignedMerchantId (order-placed merchant).
 * Allocated merchant is display-only from Contact Master (phone/email join).
 */
export async function fetchMerchantDailyInvoices(
  companyId: string,
  merchantUserId: string,
  params: {
    dayYmd: string;
    dateType?: DashboardSalesDateType;
  },
): Promise<MerchantDailyInvoicesResult> {
  const dayYmd = params.dayYmd;
  const dateType: DashboardSalesDateType = params.dateType ?? "all_orders";
  const fromDate = parseDayStartUtc(dayYmd);
  const toDate = parseDayEndUtc(dayYmd);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return { dayYmd, total: 0, orderCount: 0, rows: [] };
  }

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
    },
  });
  if (!merchant) {
    return { dayYmd, total: 0, orderCount: 0, rows: [] };
  }

  const couponSet = new Set(
    merchant.couponCodes.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );

  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType,
  });

  const [locations, orders] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      select: { id: true, name: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        ...dateFilter,
      },
      select: {
        id: true,
        erpnextInvoiceId: true,
        name: true,
        orderNumber: true,
        createdAt: true,
        totalPrice: true,
        customerPhone: true,
        customerEmail: true,
        companyLocationId: true,
        assignedMerchantId: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
        shippingAddress: true,
        customer: { select: { firstName: true, lastName: true } },
        assignedMerchant: { select: { couponCodes: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5_000,
    }),
  ]);

  const locationNameById = new Map(locations.map((loc) => [loc.id, loc.name]));

  const attributed = orders.filter((order) => {
    if (!isDashboardSalesOrderEligible(order, dateType)) return false;

    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const orderCoupons = (merchantCouponCode ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    for (const code of orderCoupons) {
      if (couponSet.has(code)) return true;
    }
    return order.assignedMerchantId === merchantUserId;
  });

  const capped = attributed.slice(0, DAILY_INVOICES_CAP);

  const phoneVariants = new Set<string>();
  const emails = new Set<string>();
  for (const order of capped) {
    if (order.customerPhone?.trim()) {
      for (const variant of buildPhoneLookupVariants(order.customerPhone)) {
        if (variant.trim()) phoneVariants.add(variant.trim());
      }
    }
    const email = normalizeContactEmail(order.customerEmail);
    if (email?.includes("@")) emails.add(email);
  }

  const contactOr: Array<Record<string, unknown>> = [];
  if (phoneVariants.size > 0) {
    const phones = [...phoneVariants];
    contactOr.push({ phoneNumber: { in: phones } });
    contactOr.push({ phones: { some: { phoneNumber: { in: phones } } } });
  }
  if (emails.size > 0) {
    const emailList = [...emails];
    contactOr.push({ email: { in: emailList, mode: "insensitive" } });
    contactOr.push({ emails: { some: { email: { in: emailList, mode: "insensitive" } } } });
  }

  const contacts =
    contactOr.length > 0
      ? await prisma.contactMaster.findMany({
          where: { companyId, OR: contactOr },
          select: {
            assignedMerchant: true,
            phoneNumber: true,
            email: true,
            phones: { select: { phoneNumber: true } },
            emails: { select: { email: true } },
          },
          take: 2_000,
        })
      : [];

  const allocatedByPhone = new Map<string, string>();
  const allocatedByEmail = new Map<string, string>();
  for (const contact of contacts) {
    const label = (contact.assignedMerchant ?? "").trim();
    if (!label) continue;

    const addPhone = (raw: string | null | undefined) => {
      if (!raw?.trim()) return;
      for (const variant of buildPhoneLookupVariants(raw)) {
        const digits = phoneDigitsOnly(variant);
        if (digits.length >= 7 && !allocatedByPhone.has(digits)) {
          allocatedByPhone.set(digits, label);
        }
      }
    };
    const addEmail = (raw: string | null | undefined) => {
      const email = normalizeContactEmail(raw);
      if (email?.includes("@") && !allocatedByEmail.has(email)) {
        allocatedByEmail.set(email, label);
      }
    };

    addPhone(contact.phoneNumber);
    addEmail(contact.email);
    for (const row of contact.phones ?? []) addPhone(row.phoneNumber);
    for (const row of contact.emails ?? []) addEmail(row.email);
  }

  function resolveAllocatedMerchant(order: {
    customerPhone: string | null;
    customerEmail: string | null;
  }): string | null {
    if (order.customerPhone?.trim()) {
      for (const variant of buildPhoneLookupVariants(order.customerPhone)) {
        const digits = phoneDigitsOnly(variant);
        if (digits.length >= 7) {
          const label = allocatedByPhone.get(digits);
          if (label) return label;
        }
      }
    }
    const email = normalizeContactEmail(order.customerEmail);
    if (email?.includes("@")) {
      return allocatedByEmail.get(email) ?? null;
    }
    return null;
  }

  const viewerIdentity = {
    knownName: merchant.knownName,
    name: merchant.name,
    email: merchant.email,
    couponCodes: merchant.couponCodes,
  };

  let total = 0;
  const rows: MerchantDailyInvoiceRow[] = capped.map((order) => {
    const amount = Number(order.totalPrice ?? 0);
    total += amount;
    const allocatedMerchant = resolveAllocatedMerchant(order);
    const allocationMismatch = Boolean(
      allocatedMerchant &&
        !matchesMerchantAllocation(viewerIdentity, allocatedMerchant),
    );
    const invoiceLabel =
      (order.erpnextInvoiceId ?? "").trim() ||
      (order.name ?? "").trim() ||
      (order.orderNumber ?? "").trim() ||
      order.id;
    const customerName =
      pickPersonName(order) ||
      order.customerPhone ||
      order.customerEmail ||
      "Customer";

    return {
      orderId: order.id,
      invoiceLabel,
      createdAt: order.createdAt.toISOString(),
      customerName,
      customerPhone: order.customerPhone,
      amount,
      locationName: locationNameById.get(order.companyLocationId) ?? "—",
      discountCouponCode: getOrderDiscountCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
      }),
      merchantCouponCode: getMerchantCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      }),
      allocatedMerchant,
      allocationMismatch,
    };
  });

  return {
    dayYmd,
    total,
    orderCount: rows.length,
    rows,
  };
}

export type MerchantReturnStats = {
  returnOrderCount: number;
  orderCount: number;
  returnRatePct: number | null;
};

/** MTD return % = distinct returned orders / attributed order count for the period. */
export async function fetchMerchantReturnStats(
  companyId: string,
  merchantUserId: string,
  params: { fromYmd: string; toYmd: string; orderCount: number },
): Promise<MerchantReturnStats> {
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return { returnOrderCount: 0, orderCount: params.orderCount, returnRatePct: null };
  }

  const returns = await prisma.orderReturn.findMany({
    where: {
      companyId,
      merchantUserId,
      returnDate: { gte: fromDate, lte: toDate },
    },
    select: { orderId: true },
  });

  const returnOrderCount = new Set(returns.map((row) => row.orderId)).size;
  const orderCount = params.orderCount;
  const returnRatePct =
    orderCount > 0
      ? Math.round((returnOrderCount / orderCount) * 1000) / 10
      : null;

  return { returnOrderCount, orderCount, returnRatePct };
}
