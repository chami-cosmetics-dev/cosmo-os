/**
 * Read-only full-history Dump 3 export: Adapt purchase history + Cosmo OS orders.
 * Does not write to the database.
 *
 *   node scripts/with-env.mjs cosmo-prod npx --yes tsx --tsconfig tsconfig.scripts.json tmp/build-full-history-report.ts
 */
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";

import { loadKokoRefNumbersForOrders } from "../lib/approval-koko-list";
import {
  applyMerchantGroup,
  buildCouponToMerchantMap,
  getMerchantGroupUserMap,
} from "../lib/merchant-groups";
import {
  getOrderDiscountCouponCode,
  resolveOrderDiscountCouponForOrder,
} from "../lib/order-discount-coupon";
import { resolveOrderLineItemsPricing } from "../lib/order-line-item-pricing";
import { getMerchantCouponCode } from "../lib/order-merchant-coupon";
import { resolveCustomerPhone } from "../lib/order-sms-resolvers";
import { formatCsvDataLine, formatCsvHeaderLine, getCustomerName } from "../lib/reports/csv";
import {
  createOrderInvoiceItemRow,
  getOrderInvoiceItemCsvHeaders,
  type OrderInvoiceItemCsvRow,
} from "../lib/reports/order-dump";

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "tmp", "full-history-export");
const DUMP_ORDER_PAGE_SIZE = 200;
const ADAPT_PAGE_SIZE = 400;
const COSMO_CONCURRENCY = 4;

const ITEM_HEADERS = [...getOrderInvoiceItemCsvHeaders(true), "data_source", "catalog_match"] as const;
const INVOICE_HEADERS = [
  "data_source",
  "year",
  "invoice_no",
  "invoice_date",
  "invoice_total",
  "line_total",
  "line_items",
  "pos_sale",
] as const;

const prisma = new PrismaClient({ log: ["error"] });

type SalesRow = OrderInvoiceItemCsvRow & {
  data_source: string;
  catalog_match: string;
};

type InvoiceAgg = {
  data_source: string;
  year: string;
  invoice_no: string;
  invoice_date: string;
  invoice_total: number;
  line_total: number;
  line_items: number;
  pos_sale: string;
};

type CatalogHit = { barcode: string; brand: string };

type AdaptLine = {
  itemCode?: string | null;
  itemName?: string | null;
  unitPrice?: string | number | null;
  quantity?: number | string | null;
};

const ORDER_DUMP_ITEM_INCLUDE = {
  companyLocation: {
    select: {
      name: true,
      erpnextCompany: true,
      erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } },
    },
  },
  assignedMerchant: { select: { id: true, knownName: true, name: true, email: true, couponCodes: true } },
  dispatchedBy: { select: { knownName: true, name: true, email: true } },
  dispatchedByRider: { select: { knownName: true, name: true, mobile: true } },
  dispatchedByCourierService: { select: { name: true } },
  lastPrintedBy: { select: { knownName: true, name: true, email: true } },
  deliveryCompleteBy: { select: { knownName: true, name: true, email: true } },
  invoiceCompleteBy: { select: { knownName: true, name: true, email: true } },
  lineItems: {
    include: {
      productItem: {
        select: {
          sku: true,
          barcode: true,
          productTitle: true,
          vendor: { select: { name: true } },
        },
      },
    },
  },
} as const;

function log(message: string) {
  console.error(`[full-history] ${message}`);
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return value.toFixed(2);
}

function yearFromIso(isoDate: string) {
  return isoDate.slice(0, 4);
}

function normalizeSku(value: string) {
  return value.trim().toUpperCase().replace(/-/g, "_");
}

function classifyAdaptLine(item: AdaptLine): "product" | "coupon" | "shipping" | "fee" {
  const code = String(item.itemCode ?? "").trim().toLowerCase();
  if (code === "coupon") return "coupon";
  if (code === "shipping") return "shipping";
  if (code === "fee") return "fee";
  return "product";
}

function isStorePickupName(name: string) {
  return /store\s*pick/i.test(name);
}

function getUserDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
} | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || "";
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildShopifyUserIdToEmailMap(users: Array<{ email: string | null; shopifyUserIds: string[] }>) {
  const shopifyUserIdToEmail = new Map<string, string>();
  for (const user of users) {
    const email = user.email?.trim();
    if (!email) continue;
    for (const shopifyUserId of user.shopifyUserIds) {
      const normalized = shopifyUserId.trim();
      if (normalized && !shopifyUserIdToEmail.has(normalized)) {
        shopifyUserIdToEmail.set(normalized, email);
      }
    }
  }
  return shopifyUserIdToEmail;
}

function buildErpnextUsernameToEmailMap(users: Array<{ email: string | null; erpnextUsername: string | null }>) {
  const erpnextUsernameToEmail = new Map<string, string>();
  for (const user of users) {
    const email = user.email?.trim();
    const username = user.erpnextUsername?.trim().toLowerCase();
    if (email && username && !erpnextUsernameToEmail.has(username)) {
      erpnextUsernameToEmail.set(username, email);
    }
  }
  return erpnextUsernameToEmail;
}

function getRawPayloadString(rawPayload: Prisma.JsonValue | null | undefined, key: string) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  const data = top.data;
  const value =
    top[key] ??
    (data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)[key]
      : undefined);
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getPayloadLineItems(rawPayload: Prisma.JsonValue | null | undefined): Array<Record<string, unknown>> {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  const lineItems = (rawPayload as Record<string, unknown>).line_items;
  if (!Array.isArray(lineItems)) return [];
  return lineItems.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item),
  );
}

function getPayloadLineItemBrand(input: {
  rawPayload: Prisma.JsonValue | null;
  shopifyLineItemId: string;
  sku: string | null;
  index: number;
}) {
  const payloadItems = getPayloadLineItems(input.rawPayload);
  const matched =
    payloadItems.find((item) => item.id != null && String(item.id) === input.shopifyLineItemId) ??
    payloadItems.find((item) => input.sku && typeof item.sku === "string" && item.sku.trim() === input.sku.trim()) ??
    payloadItems[input.index];
  const vendor = matched?.vendor;
  return typeof vendor === "string" && vendor.trim() ? vendor.trim() : null;
}

function resolveOrderCreatedByEmail(input: {
  sourceName: string;
  shopifyUserId: string | null;
  customerEmail: string | null;
  assignedMerchantEmail: string | null;
  rawPayload: Prisma.JsonValue | null;
  auditLogEmail: string | null;
  shopifyUserIdToEmail: Map<string, string>;
  erpnextUsernameToEmail: Map<string, string>;
}) {
  if (input.auditLogEmail?.trim()) return input.auditLogEmail.trim();

  if (input.shopifyUserId) {
    const email = input.shopifyUserIdToEmail.get(input.shopifyUserId.trim());
    if (email) return email;
  }

  const sourceName = input.sourceName.toLowerCase();
  if ((sourceName === "pos" || sourceName === "manual") && input.assignedMerchantEmail?.trim()) {
    return input.assignedMerchantEmail.trim();
  }

  const owner = getRawPayloadString(input.rawPayload, "owner");
  if (owner) {
    if (looksLikeEmail(owner)) return owner;
    const email = input.erpnextUsernameToEmail.get(owner.toLowerCase());
    if (email) return email;
  }

  if ((sourceName === "web" || sourceName === "shopify") && input.customerEmail?.trim()) {
    return input.customerEmail.trim();
  }

  return "";
}

function resolveMerchantName(input: {
  couponCode: string | null;
  couponToMerchant: Map<string, { id: string | null; name: string }>;
  assignedMerchant: { id: string; knownName: string | null; name: string | null; email: string | null } | null;
  userToGroup: Map<string, { id: string; name: string }>;
}) {
  const coupons = (input.couponCode ?? "")
    .split(",")
    .map((coupon) => coupon.trim().toLowerCase())
    .filter(Boolean);

  for (const coupon of coupons) {
    const merchant = input.couponToMerchant.get(coupon);
    if (merchant) return merchant.name;
  }

  const assignedName = getUserDisplayName(input.assignedMerchant);
  if (!assignedName) return "";
  return applyMerchantGroup(
    { id: input.assignedMerchant?.id ?? null, name: assignedName },
    input.userToGroup,
  ).name;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );
  return results;
}

async function loadManualCreatorEmails(companyId: string, orderIds: string[]) {
  const orderIdToManualCreatorEmail = new Map<string, string>();
  if (orderIds.length === 0) return orderIdToManualCreatorEmail;
  const logs = await prisma.auditLog.findMany({
    where: {
      companyId,
      action: "manual_order_created",
      entityType: "Order",
      entityId: { in: orderIds },
    },
    orderBy: { createdAt: "asc" },
    select: {
      entityId: true,
      actorUser: { select: { email: true } },
    },
  });
  for (const log of logs) {
    const email = log.actorUser?.email?.trim();
    if (log.entityId && email && !orderIdToManualCreatorEmail.has(log.entityId)) {
      orderIdToManualCreatorEmail.set(log.entityId, email);
    }
  }
  return orderIdToManualCreatorEmail;
}

function invoiceKey(source: string, invoiceNo: string, invoiceDate: string) {
  return `${source}\t${invoiceNo}\t${invoiceDate}`;
}

function addInvoice(map: Map<string, InvoiceAgg>, row: InvoiceAgg) {
  const key = invoiceKey(row.data_source, row.invoice_no, row.invoice_date);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...row });
    return;
  }
  existing.line_total += row.line_total;
  existing.line_items += row.line_items;
  if (row.pos_sale === "1") existing.pos_sale = "1";
}

function betterCatalogHit(current: CatalogHit | undefined, next: CatalogHit): CatalogHit {
  if (!current) return next;
  const currentScore = (current.barcode ? 1 : 0) + (current.brand ? 1 : 0);
  const nextScore = (next.barcode ? 1 : 0) + (next.brand ? 1 : 0);
  return nextScore > currentScore ? next : current;
}

async function loadCatalog(companyId: string) {
  const items = await prisma.productItem.findMany({
    where: { companyId, sku: { not: null } },
    select: { sku: true, barcode: true, vendor: { select: { name: true } } },
  });
  const exact = new Map<string, CatalogHit>();
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) continue;
    const hit: CatalogHit = {
      barcode: item.barcode?.trim() ?? "",
      brand: item.vendor?.name?.trim() ?? "",
    };
    exact.set(normalizeSku(sku), betterCatalogHit(exact.get(normalizeSku(sku)), hit));
  }
  return exact;
}

function matchCatalog(exact: Map<string, CatalogHit>, itemCode: string | null | undefined) {
  const raw = itemCode?.trim() ?? "";
  if (!raw) return { barcode: "", brand: "", match: "none" };
  const normalized = normalizeSku(raw);
  const direct = exact.get(normalized);
  if (direct) return { barcode: direct.barcode, brand: direct.brand, match: "exact" };
  const oi = normalized.match(/^(.*)\*OI$/);
  if (oi?.[1]) {
    const mapped = exact.get(`${oi[1]}_1`) ?? exact.get(`${oi[1]}1`);
    if (mapped) return { barcode: mapped.barcode, brand: mapped.brand, match: "oi_mapped_to_1" };
  }
  return { barcode: "", brand: "", match: "none" };
}

async function exportAdapt(params: {
  writeSales: (row: SalesRow) => void;
  invoices: Map<string, InvoiceAgg>;
  catalog: Map<string, CatalogHit>;
  stats: Record<string, number>;
}) {
  let cursorId: string | undefined;
  let invoicesRead = 0;
  for (;;) {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId: COMPANY_ID },
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
      take: ADAPT_PAGE_SIZE,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: {
        id: true,
        salesInvoiceNo: true,
        invoiceDate: true,
        ttlAmount: true,
        locationName: true,
        paymentMethod: true,
        merchantKnownName: true,
        lineItems: true,
        contact: { select: { name: true } },
      },
    });
    if (rows.length === 0) break;
    cursorId = rows[rows.length - 1]!.id;
    invoicesRead += rows.length;
    params.stats.adapt_invoices_read += rows.length;

    for (const row of rows) {
      const items = Array.isArray(row.lineItems) ? (row.lineItems as AdaptLine[]) : [];
      let merchantCoupon = "";
      let posSale = "0";
      const products: AdaptLine[] = [];
      for (const item of items) {
        const kind = classifyAdaptLine(item);
        const name = String(item.itemName ?? "").trim();
        if (kind === "coupon") {
          params.stats.adapt_coupon_lines += 1;
          if (!merchantCoupon && name) merchantCoupon = name;
          continue;
        }
        if (kind === "shipping") {
          params.stats.adapt_shipping_lines += 1;
          if (isStorePickupName(name)) posSale = "1";
          continue;
        }
        if (kind === "fee") {
          params.stats.adapt_fee_lines += 1;
          continue;
        }
        products.push(item);
      }

      const invoiceDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Colombo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(row.invoiceDate);
      const invoiceNo = row.salesInvoiceNo?.trim() || "";
      const invoiceTotal = toNumber(row.ttlAmount?.toString());
      let lineTotal = 0;

      for (const item of products) {
        const qty = toNumber(item.quantity);
        const unitPrice = toNumber(item.unitPrice);
        const unitTotal = qty * unitPrice;
        lineTotal += unitTotal;
        const catalog = matchCatalog(params.catalog, item.itemCode);
        if (catalog.match === "exact") params.stats.adapt_catalog_exact += 1;
        else if (catalog.match === "oi_mapped_to_1") params.stats.adapt_catalog_oi += 1;
        else params.stats.adapt_catalog_none += 1;
        params.stats.adapt_product_lines += 1;

        const salesRow = createOrderInvoiceItemRow({
          invoiceNo,
          erpInvoiceId: null,
          sourceName: "adapt",
          merchantCouponCode: merchantCoupon || null,
          couponCode: null,
          createdAt: row.invoiceDate,
          locationName: row.locationName?.trim() ?? "",
          customerName: row.contact.name?.trim() ?? "",
          customerEmail: null,
          customerPhone: null,
          sku: item.itemCode?.trim() || "",
          barcode: catalog.barcode,
          brand: catalog.brand,
          productTitle: String(item.itemName ?? "").trim(),
          quantity: qty,
          unitPrice: money(unitPrice),
          discountedPrice: money(unitPrice),
          afterDiscountTotal: money(unitTotal),
          lineTotal: money(unitTotal),
          fulfillmentStage: "Completed",
          financialStatus: "paid",
          deliveryCompleteAt: null,
          deliveryCompleteBy: "",
          invoiceCompleteAt: row.invoiceDate,
          fulfillmentStatus: null,
          paymentGateway: row.paymentMethod?.trim() ?? "",
          merchantName: row.merchantKnownName?.trim() ?? "",
          createdBy: "",
          kokoRefNumber: "",
        });
        salesRow.status = "Completed";
        salesRow.payment_status = "paid";
        salesRow.fulfillment_status = "";
        salesRow.pos_sale = posSale;
        salesRow.source_name = "adapt";
        salesRow.grand_total = money(invoiceTotal);
        salesRow.payment_gateway = row.paymentMethod?.trim() ?? "";
        params.writeSales({
          ...salesRow,
          data_source: "Adapt history",
          catalog_match: catalog.match,
        });
      }

      addInvoice(params.invoices, {
        data_source: "Adapt history",
        year: yearFromIso(invoiceDate),
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        invoice_total: invoiceTotal,
        line_total: lineTotal,
        line_items: products.length,
        pos_sale: posSale,
      });
    }

    if (invoicesRead % 8000 === 0) log(`Adapt invoices ${invoicesRead}`);
    if (rows.length < ADAPT_PAGE_SIZE) break;
  }
  log(`Adapt done. invoices=${invoicesRead} product_lines=${params.stats.adapt_product_lines}`);
}

async function exportCosmo(params: {
  writeSales: (row: SalesRow) => void;
  invoices: Map<string, InvoiceAgg>;
  stats: Record<string, number>;
}) {
  const [merchantUsers, userToGroup, creatorUsers] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: COMPANY_ID, couponCodes: { isEmpty: false } },
      select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    }),
    getMerchantGroupUserMap(COMPANY_ID),
    prisma.user.findMany({
      where: {
        companyId: COMPANY_ID,
        OR: [{ shopifyUserIds: { isEmpty: false } }, { erpnextUsername: { not: null } }],
      },
      select: { email: true, shopifyUserIds: true, erpnextUsername: true },
    }),
  ]);
  const couponToMerchant = buildCouponToMerchantMap(merchantUsers, userToGroup);
  const shopifyUserIdToEmail = buildShopifyUserIdToEmailMap(creatorUsers);
  const erpnextUsernameToEmail = buildErpnextUsernameToEmailMap(creatorUsers);

  let cursorId: string | undefined;
  let ordersRead = 0;
  for (;;) {
    const orders = await prisma.order.findMany({
      where: { companyId: COMPANY_ID },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: DUMP_ORDER_PAGE_SIZE,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      include: ORDER_DUMP_ITEM_INCLUDE,
    });
    if (orders.length === 0) break;
    cursorId = orders[orders.length - 1]!.id;
    ordersRead += orders.length;
    params.stats.cosmo_orders_read += orders.length;

    const orderIdToManualCreatorEmail = await loadManualCreatorEmails(
      COMPANY_ID,
      orders.map((order) => order.id),
    );
    const orderIdToKokoRefNumber = await loadKokoRefNumbersForOrders(
      COMPANY_ID,
      orders.map((order) => order.id),
    );

    const pageRows = await mapWithConcurrency(orders, COSMO_CONCURRENCY, async (order) => {
      const customerName =
        getCustomerName(order.shippingAddress) ||
        getCustomerName(order.billingAddress) ||
        order.customerEmail ||
        "";
      const paymentGateway = order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "";
      const invoiceNo = order.name ?? order.orderNumber ?? order.shopifyOrderId;
      const createdBy = resolveOrderCreatedByEmail({
        sourceName: order.sourceName,
        shopifyUserId: order.shopifyUserId,
        customerEmail: order.customerEmail,
        assignedMerchantEmail: order.assignedMerchant?.email ?? null,
        rawPayload: order.rawPayload,
        auditLogEmail: orderIdToManualCreatorEmail.get(order.id) ?? null,
        shopifyUserIdToEmail,
        erpnextUsernameToEmail,
      });
      const merchantCouponCode = getMerchantCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      });
      let couponCode = getOrderDiscountCouponCode({
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
      });
      if (!couponCode) {
        couponCode = await resolveOrderDiscountCouponForOrder({
          sourceName: order.sourceName,
          discountCodes: order.discountCodes,
          rawPayload: order.rawPayload,
          name: order.name,
          erpnextInvoiceId: order.erpnextInvoiceId,
          erpnextInstance: order.companyLocation.erpnextInstance,
        });
      }
      const merchantName = resolveMerchantName({
        couponCode: merchantCouponCode,
        couponToMerchant,
        assignedMerchant: order.assignedMerchant,
        userToGroup,
      });
      const linePricing = await resolveOrderLineItemsPricing({
        sourceName: order.sourceName,
        rawPayload: order.rawPayload,
        name: order.name,
        erpnextInvoiceId: order.erpnextInvoiceId,
        erpnextInstance: order.companyLocation.erpnextInstance,
        lineItems: order.lineItems.map((item) => ({
          sku: item.productItem.sku,
          quantity: item.quantity,
          price: item.price.toString(),
        })),
      });
      const hasLineLevelDiscount = linePricing.some(
        (pricing) => pricing.originalPrice != null || pricing.originalTotal != null,
      );
      const orderDiscount = !hasLineLevelDiscount && order.totalDiscounts?.gt(0) ? order.totalDiscounts : null;
      const orderItemSubtotal = orderDiscount
        ? linePricing.reduce((sum, pricing, index) => {
            const fallbackTotal = new Prisma.Decimal(order.lineItems[index]?.price ?? 0).mul(
              order.lineItems[index]?.quantity ?? 0,
            );
            return sum.add(new Prisma.Decimal(pricing.originalTotal ?? pricing.saleTotal ?? fallbackTotal));
          }, new Prisma.Decimal(0))
        : new Prisma.Decimal(0);

      const itemRows = order.lineItems.map((item, index) => {
        const pricing = linePricing[index];
        const unitPrice = pricing?.originalPrice ?? pricing?.salePrice ?? item.price.toString();
        const lineTotal =
          pricing?.originalTotal ??
          pricing?.saleTotal ??
          new Prisma.Decimal(item.price).mul(item.quantity).toString();
        const hasDiscount = pricing?.originalPrice != null || pricing?.originalTotal != null;
        let discountedPrice = hasDiscount ? (pricing?.salePrice ?? item.price.toString()) : null;
        let afterDiscountTotal = hasDiscount
          ? (pricing?.saleTotal ?? new Prisma.Decimal(item.price).mul(item.quantity).toString())
          : null;

        if (!hasDiscount && orderDiscount && orderItemSubtotal.gt(0) && item.quantity > 0) {
          const lineTotalDecimal = new Prisma.Decimal(lineTotal);
          const allocatedDiscount = Prisma.Decimal.min(
            lineTotalDecimal,
            orderDiscount.mul(lineTotalDecimal).div(orderItemSubtotal),
          );
          const allocatedTotal = Prisma.Decimal.max(new Prisma.Decimal(0), lineTotalDecimal.minus(allocatedDiscount));
          afterDiscountTotal = allocatedTotal.toDecimalPlaces(2).toString();
          discountedPrice = allocatedTotal.div(item.quantity).toDecimalPlaces(2).toString();
        }

        return createOrderInvoiceItemRow({
          invoiceNo,
          erpInvoiceId: order.erpnextInvoiceId,
          sourceName: order.sourceName,
          merchantCouponCode,
          couponCode,
          createdAt: order.createdAt,
          locationName: order.companyLocation.name,
          customerName,
          customerEmail: order.customerEmail,
          customerPhone: resolveCustomerPhone(order) ?? null,
          sku: item.productItem.sku,
          barcode: item.productItem.barcode,
          brand:
            getPayloadLineItemBrand({
              rawPayload: order.rawPayload,
              shopifyLineItemId: item.shopifyLineItemId,
              sku: item.productItem.sku,
              index,
            }) ??
            item.productItem.vendor?.name ??
            null,
          productTitle: item.productItem.productTitle,
          quantity: item.quantity,
          unitPrice,
          discountedPrice,
          afterDiscountTotal,
          lineTotal,
          fulfillmentStage: order.fulfillmentStage,
          financialStatus: order.financialStatus,
          deliveryCompleteAt: order.deliveryCompleteAt,
          deliveryCompleteBy: getUserDisplayName(order.deliveryCompleteBy),
          invoiceCompleteAt: order.invoiceCompleteAt,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentGateway,
          merchantName,
          createdBy,
          kokoRefNumber: orderIdToKokoRefNumber.get(order.id) ?? "",
        });
      });

      return { order, itemRows };
    });

    for (const { order, itemRows } of pageRows) {
      let lineTotal = 0;
      for (const row of itemRows) {
        lineTotal += toNumber(row.after_discount_total || row.unit_price_total);
        params.stats.cosmo_product_lines += 1;
        params.writeSales({
          ...row,
          data_source: "Cosmo OS",
          catalog_match: "",
        });
      }
      const invoiceDate = itemRows[0]?.invoice_date || "";
      addInvoice(params.invoices, {
        data_source: "Cosmo OS",
        year: yearFromIso(invoiceDate),
        invoice_no: order.name ?? order.orderNumber ?? order.shopifyOrderId,
        invoice_date: invoiceDate,
        invoice_total: toNumber(order.totalPrice.toString()),
        line_total: lineTotal,
        line_items: itemRows.length,
        pos_sale: itemRows[0]?.pos_sale || "0",
      });
    }

    log(`Cosmo orders ${ordersRead}`);
    if (orders.length < DUMP_ORDER_PAGE_SIZE) break;
  }
  log(`Cosmo done. orders=${ordersRead} product_lines=${params.stats.cosmo_product_lines}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const salesPath = resolve(OUT_DIR, "sales.csv");
  const invoicesPath = resolve(OUT_DIR, "invoices.csv");
  const statsPath = resolve(OUT_DIR, "stats.json");

  const salesStream = createWriteStream(salesPath);
  salesStream.write(formatCsvHeaderLine([...ITEM_HEADERS]));
  const invoices = new Map<string, InvoiceAgg>();
  const stats: Record<string, number> = {
    adapt_invoices_read: 0,
    adapt_product_lines: 0,
    adapt_coupon_lines: 0,
    adapt_shipping_lines: 0,
    adapt_fee_lines: 0,
    adapt_catalog_exact: 0,
    adapt_catalog_oi: 0,
    adapt_catalog_none: 0,
    cosmo_orders_read: 0,
    cosmo_product_lines: 0,
  };

  log("Loading product catalog");
  const catalog = await loadCatalog(COMPANY_ID);
  log(`Catalog SKUs ${catalog.size}`);

  const writeSales = (row: SalesRow) => {
    salesStream.write(formatCsvDataLine([...ITEM_HEADERS], row));
  };

  log("Exporting Adapt history");
  await exportAdapt({ writeSales, invoices, catalog, stats });

  log("Exporting Cosmo OS Dump 3 rows (ERP lookups for ERPNext orders, no DB writes)");
  await exportCosmo({ writeSales, invoices, stats });

  await new Promise<void>((resolvePromise, reject) => {
    salesStream.end(() => resolvePromise());
    salesStream.on("error", reject);
  });

  const invoiceStream = createWriteStream(invoicesPath);
  invoiceStream.write(formatCsvHeaderLine([...INVOICE_HEADERS]));
  for (const row of invoices.values()) {
    invoiceStream.write(
      formatCsvDataLine([...INVOICE_HEADERS], {
        data_source: row.data_source,
        year: row.year,
        invoice_no: row.invoice_no,
        invoice_date: row.invoice_date,
        invoice_total: money(row.invoice_total),
        line_total: money(row.line_total),
        line_items: String(row.line_items),
        pos_sale: row.pos_sale,
      }),
    );
  }
  await new Promise<void>((resolvePromise, reject) => {
    invoiceStream.end(() => resolvePromise());
    invoiceStream.on("error", reject);
  });

  await writeFile(statsPath, `${JSON.stringify({ ...stats, invoices: invoices.size }, null, 2)}\n`);
  log(`Wrote ${salesPath}`);
  log(`Wrote ${invoicesPath}`);
  log(`Wrote ${statsPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
