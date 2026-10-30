import "server-only";

import { Prisma } from "@prisma/client";

import { normalizeMerCodeKey } from "@/lib/merchant-allocation";
import { monthKeyInColombo, salesMonthBounds } from "@/lib/osf/monthly-sales";
import { prisma } from "@/lib/prisma";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import { SALES_BUDGET_ONLINE_MERCHANT_ROLE, SALES_BUDGET_SHOPS } from "@/lib/sales-budget/config";

/** One aggregated bucket: units of a variant SKU sold in a month. */
export type SalesBucket = {
  /** Colombo calendar month, YYYY-MM. */
  month: string;
  /** ERP Sales Invoice is_pos = 1 (Order.sourceName "erpnext-pos"). */
  pos: boolean;
  /** POS sales: the POS warehouse (Order.erpnextWarehouse) = the shop. */
  warehouse: string | null;
  /**
   * Non-POS sales: Order.assignedMerchantId, or — when the order has none — the user whose
   * merchant coupon code (MER number) is on the order's discount codes.
   */
  merchantId: string | null;
  qty: number;
};

export type SalesBudgetSalesData = {
  /** SKU key (upper-case) → buckets. */
  bySku: Map<string, SalesBucket[]>;
  /** First month NOT counted (the current month); everything before it is complete. */
  currentMonth: string;
  /**
   * ONLINE tab merchants, name → user ids: users with SALES_BUDGET_ONLINE_MERCHANT_ROLE, a
   * merchant coupon code and no Outlet. Sorted by name; also the Merchant dropdown options.
   */
  onlineMerchantIds: Map<string, string[]>;
  /**
   * SHOP tab ONLINE channel, shop name → user ids: staff on that shop's Outlet with a merchant
   * coupon code. Includes inactive staff so a departed merchant's history still counts.
   */
  shopOnlineMerchantIds: Map<string, string[]>;
  /**
   * Merchant Dashboard "Month target" for the current month (MerchantMonthlyTarget
   * shop / online amounts), by user id — ACTIVE staff only. Read-only: the dashboard's
   * carry-forward writes them.
   */
  targetsByUser: Map<string, { shop: number | null; online: number | null }>;
  /** "MER<n>" → the user owning that merchant coupon (unassigned online orders' merchant). */
  userByMerCode: Map<string, string>;
  fetchedAt: Date;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, SalesBudgetSalesData>();
const inFlight = new Map<string, Promise<SalesBudgetSalesData>>();

/** A sale's date: delivery complete, else invoice complete (UTC "timestamp without time zone"). */
const SALE_DATE_SQL = Prisma.sql`COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")`;

/** The sale's Colombo calendar month, YYYY-MM (columns are UTC: mark them before converting). */
const SALE_MONTH_SQL = Prisma.sql`to_char(timezone('Asia/Colombo', ${SALE_DATE_SQL} AT TIME ZONE 'UTC'), 'YYYY-MM')`;

/** The first merchant coupon on the order's discount codes, as "MER<n>"; null when none. */
const ORDER_MER_CODE_SQL = Prisma.sql`(
  -- POSIX classes: a JS template literal would strip "\s" / "\d" backslashes.
  SELECT 'MER' || substring(
    elem->>'code' FROM '^[[:space:]]*[Mm][Ee][Rr][[:space:]]*([0-9]+)'
  )
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(o."discountCodes"::jsonb) = 'array'
         THEN o."discountCodes"::jsonb ELSE '[]'::jsonb END
  ) AS elem
  WHERE elem->>'code' ~ '^[[:space:]]*[Mm][Ee][Rr][[:space:]]*[0-9]+'
  LIMIT 1
)`;

/** Sale attribution columns: POS flag, POS warehouse, assigned merchant, merchant coupon. */
const SALE_ATTRIBUTION_SQL = Prisma.sql`
  (o."sourceName" = 'erpnext-pos') AS pos,
  CASE WHEN o."sourceName" = 'erpnext-pos' THEN btrim(o."erpnextWarehouse") END AS warehouse,
  CASE WHEN o."sourceName" = 'erpnext-pos' THEN NULL ELSE o."assignedMerchantId" END AS merchant_id,
  -- Unassigned online orders: the merchant coupon on the order, as "MER<n>".
  CASE
    WHEN o."sourceName" = 'erpnext-pos' OR o."assignedMerchantId" IS NOT NULL THEN NULL
    ELSE ${ORDER_MER_CODE_SQL}
  END AS mer_code`;

/**
 * Sales lines Highest Sale Qty counts, for every completed month before `endExclusive`
 * (FROM "OrderLineItem" li / "Order" o / "ProductItem" pi). Orders the order dump
 * (lib/reports/order-dump.ts) shows as "Completed" (POS sale, or online delivered + invoiced)
 * or "Delivery Completed" (online delivered, not invoiced yet): not cancelled, not voided,
 * delivery/invoice complete stage. Dated by SALE_DATE_SQL. Returned (credit-noted) orders
 * move to the "returned" stage, so they drop out here.
 */
function countedSaleLinesSql(companyId: string, endExclusive: Date) {
  return Prisma.sql`
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "ProductItem" pi ON pi.id = li."productItemId"
    WHERE o."companyId" = ${companyId}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      -- Order-dump statuses counted: "Completed" (POS sale, or online delivered + invoiced)
      -- and "Delivery Completed" (online delivered, not invoiced yet). Not voided orders,
      -- nor online orders that are only invoiced.
      AND lower(coalesce(o."financialStatus", '')) <> 'voided'
      AND (o."sourceName" = 'erpnext-pos' OR o."deliveryCompleteAt" IS NOT NULL)
      AND ${SALE_DATE_SQL} < ${endExclusive}
      AND pi.sku IS NOT NULL
      AND btrim(pi.sku) <> ''`;
}

type SaleAttributionRow = {
  pos: boolean;
  warehouse: string | null;
  merchant_id: string | null;
  mer_code: string | null;
};

/** Non-POS sales: the assigned merchant, else the user owning the order's merchant coupon. */
function saleMerchantId(row: SaleAttributionRow, userByMerCode: Map<string, string>) {
  return row.merchant_id ?? (row.mer_code ? (userByMerCode.get(row.mer_code) ?? null) : null);
}

/** Units by variant SKU × month × POS flag × POS warehouse × merchant (counted lines only). */
async function querySalesBuckets(companyId: string, endExclusive: Date) {
  return prisma.$queryRaw<
    Array<SaleAttributionRow & { sku: string; month: string; qty: bigint | number }>
  >(Prisma.sql`
    SELECT btrim(pi.sku) AS sku,
           ${SALE_MONTH_SQL} AS month,
           ${SALE_ATTRIBUTION_SQL},
           SUM(li.quantity)::int AS qty
    ${countedSaleLinesSql(companyId, endExclusive)}
    GROUP BY 1, 2, 3, 4, 5, 6
  `);
}

/** One counted sales line (the rows behind the buckets), with the order's details. */
export type CountedSaleLine = {
  /** Variant SKU, trimmed. */
  sku: string;
  month: string;
  pos: boolean;
  warehouse: string | null;
  /** Same merchant the bucket gets (null for POS sales). */
  merchantId: string | null;
  qty: number;
  price: number;
  order: {
    name: string | null;
    orderNumber: string | null;
    shopifyOrderId: string;
    erpnextInvoiceId: string | null;
    sourceName: string;
    financialStatus: string | null;
    fulfillmentStage: string;
    totalPrice: string;
    printCount: number;
    packageReadyAt: Date | null;
    lastPrintedAt: Date | null;
    dispatchedAt: Date | null;
    revertedFromInvoiceCompleteAt: Date | null;
    deliveryCompleteAt: Date | null;
    invoiceCompleteAt: Date | null;
    createdAt: Date;
    /** Sale date (SALE_DATE_SQL). */
    saleAt: Date;
    discountCodes: unknown;
    /** ERP orders: only the payload's coupon fields; null for other sources. */
    erpCoupons: Record<string, unknown> | null;
    assignedMerchantId: string | null;
    /** Merchant coupon on the order ("MER<n>"), any source. */
    orderMerCode: string | null;
    erpnextWarehouse: string | null;
    companyName: string;
  };
};

/**
 * Every line Highest Sale Qty counts (same filter, month and merchant rules as the buckets),
 * for months before `endMonth` (YYYY-MM). Oldest sale first.
 */
export async function loadCountedSaleLines(
  companyId: string,
  data: SalesBudgetSalesData,
  endMonth: string,
): Promise<CountedSaleLine[]> {
  const { start: endExclusive } = salesMonthBounds(endMonth);
  const rows = await prisma.$queryRaw<
    Array<
      SaleAttributionRow & {
        sku: string;
        month: string;
        qty: number;
        price: Prisma.Decimal;
        name: string | null;
        order_number: string | null;
        shopify_order_id: string;
        erpnext_invoice_id: string | null;
        source_name: string;
        financial_status: string | null;
        fulfillment_stage: string;
        total_price: Prisma.Decimal;
        print_count: number;
        package_ready_at: Date | null;
        last_printed_at: Date | null;
        dispatched_at: Date | null;
        reverted_at: Date | null;
        delivery_complete_at: Date | null;
        invoice_complete_at: Date | null;
        created_at: Date;
        sale_at: Date;
        discount_codes: unknown;
        erp_coupons: Record<string, unknown> | null;
        assigned_merchant_id: string | null;
        order_mer_code: string | null;
        erpnext_warehouse: string | null;
        company_name: string;
      }
    >
  >(Prisma.sql`
    SELECT btrim(pi.sku) AS sku,
           ${SALE_MONTH_SQL} AS month,
           ${SALE_ATTRIBUTION_SQL},
           li.quantity AS qty,
           li.price,
           o.name,
           o."orderNumber" AS order_number,
           o."shopifyOrderId" AS shopify_order_id,
           o."erpnextInvoiceId" AS erpnext_invoice_id,
           o."sourceName" AS source_name,
           o."financialStatus" AS financial_status,
           o."fulfillmentStage"::text AS fulfillment_stage,
           o."totalPrice" AS total_price,
           o."printCount" AS print_count,
           o."packageReadyAt" AS package_ready_at,
           o."lastPrintedAt" AS last_printed_at,
           o."dispatchedAt" AS dispatched_at,
           o."revertedFromInvoiceCompleteAt" AS reverted_at,
           o."deliveryCompleteAt" AS delivery_complete_at,
           o."invoiceCompleteAt" AS invoice_complete_at,
           o."createdAt" AS created_at,
           ${SALE_DATE_SQL} AS sale_at,
           o."discountCodes" AS discount_codes,
           -- Only the coupon fields of ERP payloads (the full payloads are large).
           CASE WHEN o."sourceName" LIKE 'erpnext%' THEN (
             SELECT jsonb_build_object(
               'merchant_coupon_code', p->'merchant_coupon_code',
               'custom_merchant_coupon_code', p->'custom_merchant_coupon_code',
               'coupon_code', p->'coupon_code',
               'custom_coupon_code', p->'custom_coupon_code'
             )
             FROM (
               SELECT CASE WHEN jsonb_typeof(o."rawPayload"::jsonb->'data') = 'object'
                           THEN o."rawPayload"::jsonb->'data' ELSE o."rawPayload"::jsonb END AS p
             ) payload
           ) END AS erp_coupons,
           o."assignedMerchantId" AS assigned_merchant_id,
           ${ORDER_MER_CODE_SQL} AS order_mer_code,
           o."erpnextWarehouse" AS erpnext_warehouse,
           -- Same as the order dump's company_name.
           (SELECT COALESCE(cl."erpnextCompany", cl.name)
              FROM "CompanyLocation" cl WHERE cl.id = o."companyLocationId") AS company_name
    ${countedSaleLinesSql(companyId, endExclusive)}
    ORDER BY ${SALE_DATE_SQL}, o.id, li.id
  `);
  return rows.map((row) => ({
    sku: row.sku,
    month: row.month,
    pos: row.pos,
    warehouse: row.warehouse,
    merchantId: saleMerchantId(row, data.userByMerCode),
    qty: Number(row.qty),
    price: Number(row.price),
    order: {
      name: row.name,
      orderNumber: row.order_number,
      shopifyOrderId: row.shopify_order_id,
      erpnextInvoiceId: row.erpnext_invoice_id,
      sourceName: row.source_name,
      financialStatus: row.financial_status,
      fulfillmentStage: row.fulfillment_stage,
      totalPrice: row.total_price.toString(),
      printCount: row.print_count,
      packageReadyAt: row.package_ready_at,
      lastPrintedAt: row.last_printed_at,
      dispatchedAt: row.dispatched_at,
      revertedFromInvoiceCompleteAt: row.reverted_at,
      deliveryCompleteAt: row.delivery_complete_at,
      invoiceCompleteAt: row.invoice_complete_at,
      createdAt: row.created_at,
      saleAt: row.sale_at,
      discountCodes: row.discount_codes,
      erpCoupons: row.erp_coupons,
      assignedMerchantId: row.assigned_merchant_id,
      orderMerCode: row.order_mer_code,
      erpnextWarehouse: row.erpnext_warehouse,
      companyName: row.company_name,
    },
  }));
}

/** Positive amount or null (0 / blank = no target). */
const positiveOrNull = (value: unknown) => {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Same rows the Merchant Dashboard scorecard shows as "Month target" (shop / online). */
async function loadMonthTargets(companyId: string, yearMonth: string, userIds: string[]) {
  const rows = await prisma.merchantMonthlyTarget.findMany({
    where: { companyId, yearMonth, userId: { in: [...new Set(userIds)] } },
    select: { userId: true, shopTargetAmount: true, onlineTargetAmount: true },
  });
  return new Map(
    rows.map((r) => [
      r.userId,
      { shop: positiveOrNull(r.shopTargetAmount), online: positiveOrNull(r.onlineTargetAmount) },
    ]),
  );
}

const hasMerchantCoupon = (couponCodes: string[] | null | undefined) =>
  (couponCodes ?? []).some((code) => Boolean(normalizeMerCodeKey(code)));

/** "sachini" → "Sachini", "maheshi priyadarshani" → "Maheshi Priyadarshani" (display only). */
const capitalizeWords = (name: string) =>
  name.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());

/** Merchant name as the Sales Budget shows it (ONLINE merchant labels). */
export const merchantLabel = (user: Parameters<typeof getMerchantDisplayName>[0]) =>
  capitalizeWords(getMerchantDisplayName(user));

async function buildSalesData(companyId: string): Promise<SalesBudgetSalesData> {
  const currentMonth = monthKeyInColombo(new Date());
  const { start: currentMonthStart } = salesMonthBounds(currentMonth);

  const [rows, users, onlineMerchants, outletStaff] = await Promise.all([
    querySalesBuckets(companyId, currentMonthStart),
    prisma.user.findMany({
      where: { couponCodes: { isEmpty: false } },
      select: { id: true, couponCodes: true },
    }),
    // ONLINE merchants: merchant role + no Outlet (any status, so history keeps counting).
    prisma.user.findMany({
      where: {
        companyId,
        userRoles: { some: { role: { name: SALES_BUDGET_ONLINE_MERCHANT_ROLE } } },
        NOT: { employeeProfile: { is: { outletId: { not: null } } } },
      },
      select: {
        id: true,
        knownName: true,
        name: true,
        email: true,
        couponCodes: true,
        employeeProfile: { select: { status: true } },
      },
    }),
    // Shop online merchants come from Staff → Outlet, so moving a merchant needs no config edit.
    // Any status: a merchant who left still owns their past sales for that shop.
    prisma.employeeProfile.findMany({
      where: {
        companyId,
        outlet: { name: { in: SALES_BUDGET_SHOPS.map((s) => s.outlet) } },
      },
      select: {
        userId: true,
        status: true,
        outlet: { select: { name: true } },
        user: { select: { couponCodes: true } },
      },
    }),
  ]);

  // "MER<n>" → merchant user, from each user's own coupon codes (MER103-Semini → MER103).
  const userByMerCode = new Map<string, string>();
  for (const user of users) {
    for (const code of user.couponCodes) {
      const key = normalizeMerCodeKey(code);
      if (key && !userByMerCode.has(key)) userByMerCode.set(key, user.id);
    }
  }

  const bySku = new Map<string, SalesBucket[]>();
  for (const row of rows) {
    const qty = Number(row.qty);
    if (!row.sku || !row.month || !Number.isFinite(qty)) continue;
    const key = normalizeSkuKey(row.sku);
    const list = bySku.get(key) ?? [];
    list.push({
      month: row.month,
      pos: row.pos,
      warehouse: row.warehouse,
      // Assigned merchant first; unassigned online orders fall back to their merchant coupon.
      merchantId: saleMerchantId(row, userByMerCode),
      qty,
    });
    bySku.set(key, list);
  }

  // Sales merchants only: anyone without a merchant coupon code (e.g. analysts) is skipped.
  const onlineMerchantIds = new Map<string, string[]>();
  for (const user of onlineMerchants
    .filter((u) => hasMerchantCoupon(u.couponCodes))
    .map((u) => ({ id: u.id, label: merchantLabel(u) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))) {
    onlineMerchantIds.set(user.label, [...(onlineMerchantIds.get(user.label) ?? []), user.id]);
  }
  const shopOnlineMerchantIds = new Map(
    SALES_BUDGET_SHOPS.map((shop) => [
      shop.name,
      outletStaff
        .filter((p) => p.outlet?.name === shop.outlet && hasMerchantCoupon(p.user?.couponCodes))
        .map((p) => p.userId),
    ]),
  );

  return {
    bySku,
    currentMonth,
    onlineMerchantIds,
    shopOnlineMerchantIds,
    // Targets: active staff only. Sales history above keeps everyone, so a merchant who left
    // still owns their past sales, but their (possibly carried-forward) target no longer counts.
    targetsByUser: await loadMonthTargets(companyId, currentMonth, [
      ...onlineMerchants
        .filter((u) => (u.employeeProfile?.status ?? "active") === "active")
        .map((u) => u.id),
      ...outletStaff.filter((p) => p.status === "active").map((p) => p.userId),
    ]),
    userByMerCode,
    fetchedAt: new Date(),
  };
}

/** Cached per company; `refresh` (the screen's Refresh) re-aggregates. */
export async function getSalesBudgetSalesData(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<SalesBudgetSalesData> {
  const cached = cache.get(companyId);
  const fresh =
    cached &&
    Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS &&
    cached.currentMonth === monthKeyInColombo(new Date());
  if (!options.refresh && fresh) return cached;

  const existing = inFlight.get(companyId);
  if (existing) return existing;

  const promise = buildSalesData(companyId)
    .then((data) => {
      cache.set(companyId, data);
      return data;
    })
    .finally(() => inFlight.delete(companyId));
  inFlight.set(companyId, promise);
  return promise;
}
