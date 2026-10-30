import "server-only";

import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { prisma } from "@/lib/prisma";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import { escapeCsvCell, formatIsoDate } from "@/lib/reports/csv";
import { joinDumpCouponCodes, resolveInvoiceStatus } from "@/lib/reports/order-dump";
import { saleInScope } from "@/lib/sales-budget/calculations";
import { SALES_BUDGET_SHOPS, SALES_BUDGET_VAT_LABELS } from "@/lib/sales-budget/config";
import {
  commonSkuOf,
  saleScopeFor,
  vatClassOf,
  type SalesBudgetBase,
  type VariantRow,
} from "@/lib/sales-budget/page-data";
import { loadCountedSaleLines, merchantLabel } from "@/lib/sales-budget/sales-data";

export const SALES_HISTORY_HEADERS = [
  "Invoice No",
  "ERP Invoice ID",
  "SKU",
  "Common SKU",
  "Product Title",
  "Brand",
  "Priority",
  "VAT",
  "Channel",
  "Merchant",
  "Coupon Code",
  "Status",
  "Location",
  "Qty",
  "Selling Price",
  "Invoice Date",
  "Completed Date",
  "Company Name",
  "POS Warehouse",
  "POS",
] as const;

export type SalesHistoryRow = Record<(typeof SALES_HISTORY_HEADERS)[number], string | number>;

/**
 * Every sales line behind Highest Sale Qty, built on request from the orders in the database
 * (completed months don't change, so nothing is stored): the counted lines (same query, month
 * and merchant rules as the sales buckets) whose SKU is in the budget's catalog and whose sale
 * falls in a sheet's scope (same saleScopeFor / saleInScope as the calculation), for months
 * before `endMonth`.
 * - POS sale at a shop's warehouse → SHOP-SHOP, Location = that shop;
 * - online sale by an ONLINE merchant → ONLINE, Location = "Online";
 * - online sale by a shop's online merchant → SHOP-ONLINE, Location = that merchant's shop.
 */
export async function buildSalesHistoryRows(
  base: SalesBudgetBase,
  endMonth: string,
): Promise<SalesHistoryRow[]> {
  const { sales } = base;
  // The sold variant's catalog item (same ERP-merged values as the budget sheets).
  const itemByKey = new Map<string, { commonSku: string; variant: VariantRow }>();
  for (const v of base.catalog) {
    const key = normalizeSkuKey(v.sku);
    if (!itemByKey.has(key)) itemByKey.set(key, { commonSku: commonSkuOf(v), variant: v });
  }

  const shopScopes = SALES_BUDGET_SHOPS.map((shop) => ({
    name: shop.name,
    scope: saleScopeFor(sales, "shop", shop.name, "shop"),
  }));
  const onlineScope = saleScopeFor(sales, "online", null, null);
  const shopOnlineScope = saleScopeFor(sales, "shop", null, "online");
  const onlineLabelById = new Map<string, string>();
  for (const [label, ids] of sales.onlineMerchantIds) ids.forEach((id) => onlineLabelById.set(id, label));
  const shopByOnlineMerchant = new Map<string, string>();
  for (const [shop, ids] of sales.shopOnlineMerchantIds) {
    ids.forEach((id) => {
      if (!shopByOnlineMerchant.has(id)) shopByOnlineMerchant.set(id, shop);
    });
  }

  const lines = await loadCountedSaleLines(base.companyId, sales, endMonth);
  const placed = lines.flatMap((line) => {
    const item = itemByKey.get(normalizeSkuKey(line.sku));
    if (!item) return [];
    const shop = shopScopes.find((s) => saleInScope(s.scope, line));
    if (shop) return [{ line, item, channel: "SHOP-SHOP", location: shop.name }];
    if (saleInScope(onlineScope, line)) {
      return [{ line, item, channel: "ONLINE", location: "Online" }];
    }
    if (saleInScope(shopOnlineScope, line)) {
      const location = shopByOnlineMerchant.get(line.merchantId!) ?? "";
      return [{ line, item, channel: "SHOP-ONLINE", location }];
    }
    return [];
  });

  // Merchant column: the sale's merchant; POS sales use the order's assigned merchant, else the
  // owner of its merchant coupon.
  const merchantIdOf = ({ line }: (typeof placed)[number]) =>
    line.merchantId ??
    line.order.assignedMerchantId ??
    (line.order.orderMerCode ? (sales.userByMerCode.get(line.order.orderMerCode) ?? null) : null);
  const userIds = new Set<string>();
  for (const p of placed) {
    const id = merchantIdOf(p);
    if (id) userIds.add(id);
    if (p.line.order.assignedMerchantId) userIds.add(p.line.order.assignedMerchantId);
  }
  const users = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
      })
    ).map((u) => [u.id, u]),
  );

  return placed.map((p) => {
    const { line, item, channel, location } = p;
    const { order } = line;
    const merchantId = merchantIdOf(p);
    const merchantUser = merchantId ? users.get(merchantId) : undefined;
    // Same coupon column as the order dump (merchant + discount coupons), from the stored order.
    const merchantCoupon = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.erpCoupons,
      assignedMerchantCouponCodes: order.assignedMerchantId
        ? (users.get(order.assignedMerchantId)?.couponCodes ?? null)
        : null,
      joinAllDiscountCodes: true,
    });
    const discountCoupon = getOrderDiscountCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.erpCoupons,
    });
    return {
      "Invoice No": order.name ?? order.orderNumber ?? order.shopifyOrderId,
      "ERP Invoice ID": order.erpnextInvoiceId ?? "",
      SKU: line.sku,
      "Common SKU": item.commonSku,
      "Product Title": item.variant.productTitle,
      Brand: item.variant.brand ?? "",
      Priority: item.variant.priority ?? "",
      VAT: SALES_BUDGET_VAT_LABELS[vatClassOf(item.variant)],
      Channel: channel,
      Merchant: channel === "ONLINE"
        ? (onlineLabelById.get(merchantId!) ?? "")
        : merchantUser
          ? merchantLabel(merchantUser)
          : "",
      "Coupon Code": joinDumpCouponCodes(merchantCoupon, discountCoupon),
      Status: resolveInvoiceStatus({
        sourceName: order.sourceName,
        financialStatus: order.financialStatus,
        fulfillmentStage: order.fulfillmentStage,
        grandTotal: order.totalPrice,
        printCount: order.printCount,
        packageReadyAt: order.packageReadyAt,
        lastPrintedAt: order.lastPrintedAt,
        dispatchedAt: order.dispatchedAt,
        revertedFromInvoiceCompleteAt: order.revertedFromInvoiceCompleteAt,
        deliveryCompleteAt: order.deliveryCompleteAt,
        invoiceCompleteAt: order.invoiceCompleteAt,
      }),
      Location: location,
      Qty: line.qty,
      "Selling Price": line.price,
      "Invoice Date": formatIsoDate(order.createdAt),
      "Completed Date": formatIsoDate(order.saleAt),
      "Company Name": order.companyName,
      "POS Warehouse": order.erpnextWarehouse ?? "",
      POS: line.pos ? 1 : 0,
    };
  });
}

/** UTF-8 CSV with BOM (Excel), quoted where needed, YYYY-MM-DD dates, plain numbers. */
export function salesHistoryCsv(rows: SalesHistoryRow[]): string {
  const lines = [SALES_HISTORY_HEADERS.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(SALES_HISTORY_HEADERS.map((h) => escapeCsvCell(row[h])).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Sales history CSV for months before `endMonth`: the Export uses the current month (what
 * today's Highest Sale Qty covers); a saved budget uses the month it was saved in.
 */
export async function buildSalesHistoryCsv(
  base: SalesBudgetBase,
  endMonth: string,
): Promise<string> {
  return salesHistoryCsv(await buildSalesHistoryRows(base, endMonth));
}
