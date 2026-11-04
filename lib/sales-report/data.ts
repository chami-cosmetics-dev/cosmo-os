import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCustomerName, formatAddress, formatIsoDate } from "@/lib/reports/csv";
import { joinDumpCouponCodes } from "@/lib/reports/order-dump";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { fetchErpTaxStatusBySkus } from "@/lib/osf/erp-tax-status";
import { normalizeSkuKey, resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { resolveOrderLineItemsPricing } from "@/lib/order-line-item-pricing";

export const SALES_REPORT_DUMP2_HEADERS = [
  "INVOICE_NO", "ERP_INVOICE_ID", "SOURCE_NAME", "CUSTOMER_NAME", "GRAND_TOTAL", "INVOICE_DATE", "COUPON_CODE", "STATUS", "POS_WAREHOUSE", "POS_SALE", "CREATED_BY", "COMPANY_NAME", "DISCOUNTS", "CUSTOMER_EMAIL", "CUSTOMER_PHONE", "SHIPPING_ADDRESS", "BILLING_ADDRESS",
] as const;
export const SALES_REPORT_DUMP3_HEADERS = ["INVOICE_NO", "ERP_INVOICE_ID", "SKU", "GRAND_TOTAL", "BRAND", "LOCATION_NAME"] as const;
export const SALES_REPORT_ITEM_HEADERS = ["Item Code", "Tax Status", "ERP2 Tax Status"] as const;

function jsonString(value: Prisma.JsonValue | null | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const object = value as Record<string, unknown>;
  const nested = object.data && typeof object.data === "object" && !Array.isArray(object.data) ? object.data as Record<string, unknown> : null;
  const raw = object[key] ?? nested?.[key];
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? "")).filter(Boolean).join(",");
  return raw == null ? "" : String(raw);
}
function reportSourceName(sourceName: string) { if (sourceName === "web") return "Shopify"; if (sourceName === "manual") return "Manual"; if (sourceName === "erpnext") return "ERPNext"; if (sourceName === "erpnext-pos") return "ERPNext POS"; return sourceName; }
function creatorEmail(order: { sourceName: string; rawPayload: Prisma.JsonValue | null; assignedMerchant?: { email: string | null } | null; customerEmail: string | null }) {
  const source = order.sourceName.toLowerCase();
  if ((source === "pos" || source === "manual") && order.assignedMerchant?.email?.trim()) return order.assignedMerchant.email.trim();
  const owner = jsonString(order.rawPayload, "owner");
  if (owner && owner.includes("@")) return owner;
  if ((source === "web" || source === "shopify") && order.customerEmail?.trim()) return order.customerEmail.trim();
  return owner || "";
}
function isPosSale(sourceName: string) { const value = sourceName.toLowerCase(); return value === "pos" || value === "erpnext-pos" ? 1 : 0; }
function reportStatus(order: { sourceName: string; financialStatus: string | null; fulfillmentStage: string; deliveryCompleteAt: Date | null; invoiceCompleteAt: Date | null }) {
  if (order.financialStatus?.toLowerCase() === "voided") return "voided";
  if (order.fulfillmentStage.toLowerCase() === "returned_to_store") return "Returned to Store";
  if (isPosSale(order.sourceName)) return "Completed";
  if (order.deliveryCompleteAt && order.invoiceCompleteAt) return "Completed";
  if (order.deliveryCompleteAt) return "Delivery Completed";
  if (order.invoiceCompleteAt) return "Invoice Completed";
  return order.fulfillmentStage || "";
}
function payloadLineBrand(rawPayload: Prisma.JsonValue | null, sku: string | null, index: number) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return "";
  const items = (rawPayload as Record<string, unknown>).line_items;
  if (!Array.isArray(items)) return "";
  const matched = items.find((item) => item && typeof item === "object" && !Array.isArray(item) && sku && String((item as Record<string, unknown>).sku ?? "").trim() === sku.trim()) ?? items[index];
  if (!matched || typeof matched !== "object" || Array.isArray(matched)) return "";
  const vendor = (matched as Record<string, unknown>).vendor;
  return typeof vendor === "string" ? vendor.trim() : "";
}
export async function loadSalesReportInputs(companyId: string, fromDate: string, toDate: string) {
  const rangeStart = new Date(`${fromDate}T00:00:00.000Z`);
  const reportEnd = new Date(`${toDate}T00:00:00.000Z`);
  reportEnd.setUTCDate(reportEnd.getUTCDate() + 1);
  const orders = await prisma.order.findMany({
    where: { companyId, createdAt: { gte: rangeStart, lt: reportEnd } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      name: true, orderNumber: true, shopifyOrderId: true, erpnextInvoiceId: true, sourceName: true, totalPrice: true, totalDiscounts: true, createdAt: true, financialStatus: true, fulfillmentStage: true, deliveryCompleteAt: true, invoiceCompleteAt: true, customerEmail: true, customerPhone: true, shippingAddress: true, billingAddress: true, rawPayload: true, discountCodes: true, erpnextWarehouse: true,
      assignedMerchant: { select: { email: true, couponCodes: true } }, companyLocation: { select: { name: true, erpnextCompany: true, erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } } } },
      lineItems: { select: { quantity: true, price: true, productItem: { select: { sku: true, vendor: { select: { name: true } } } } } },
    },
  });
  const dump2 = [SALES_REPORT_DUMP2_HEADERS as unknown as string[]];
  const dump3 = [SALES_REPORT_DUMP3_HEADERS as unknown as string[]];
  const itemList = [SALES_REPORT_ITEM_HEADERS as unknown as string[]];
  const skus = [...new Set(orders.flatMap((order) => order.lineItems.map((line) => line.productItem.sku).filter((sku): sku is string => Boolean(sku))))];
  const erpInstances = await getAllOsfErpInstances(companyId);
  const erpSlots = resolveErpSlots(erpInstances);
  const erp1 = erpInstances.find((instance) => instance.id === erpSlots.erp1?.id);
  const erp2 = erpInstances.find((instance) => instance.id === erpSlots.erp2?.id);
  const [erp1TaxBySku, erp2TaxBySku] = await Promise.all([
    erp1 ? fetchErpTaxStatusBySkus(erp1.cfg, skus) : Promise.resolve(new Map<string, string | null>()),
    erp2 ? fetchErpTaxStatusBySkus(erp2.cfg, skus) : Promise.resolve(new Map<string, string | null>()),
  ]);
  for (const order of orders) {
    const invoice = order.name || order.orderNumber || order.shopifyOrderId;
    const merchantCoupon = getMerchantCouponCode({ sourceName: order.sourceName, discountCodes: order.discountCodes, rawPayload: order.rawPayload, assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes, joinAllDiscountCodes: true });
    const discountCoupon = getOrderDiscountCouponCode({ sourceName: order.sourceName, discountCodes: order.discountCodes, rawPayload: order.rawPayload });
    const coupon = joinDumpCouponCodes(merchantCoupon, discountCoupon);
    dump2.push([invoice, order.erpnextInvoiceId || "", reportSourceName(order.sourceName), getCustomerName(order.shippingAddress) || getCustomerName(order.billingAddress) || order.customerEmail || "", order.totalPrice.toString(), formatIsoDate(order.createdAt), coupon, reportStatus(order), order.erpnextWarehouse || "", String(isPosSale(order.sourceName)), creatorEmail(order), order.companyLocation.erpnextCompany ?? order.companyLocation.name, order.totalDiscounts?.toString() || "0", order.customerEmail || "", order.customerPhone || "", formatAddress(order.shippingAddress), formatAddress(order.billingAddress)]);
    const linePricing = await resolveOrderLineItemsPricing({ sourceName: order.sourceName, rawPayload: order.rawPayload, name: order.name, erpnextInvoiceId: order.erpnextInvoiceId, erpnextInstance: order.companyLocation.erpnextInstance, lineItems: order.lineItems.map((line) => ({ sku: line.productItem.sku, quantity: line.quantity, price: line.price.toString() })) });
    const hasLineLevelDiscount = linePricing.some((pricing) => pricing.originalPrice != null || pricing.originalTotal != null);
    const orderDiscount = !hasLineLevelDiscount && order.totalDiscounts?.gt(0) ? order.totalDiscounts : null;
    const orderItemSubtotal = orderDiscount ? linePricing.reduce((sum, pricing, index) => sum.add(new Prisma.Decimal(pricing.originalTotal ?? pricing.saleTotal ?? new Prisma.Decimal(order.lineItems[index]!.price).mul(order.lineItems[index]!.quantity))), new Prisma.Decimal(0)) : new Prisma.Decimal(0);
    for (const [index, line] of order.lineItems.entries()) {
      const pricing = linePricing[index];
      const lineTotal = new Prisma.Decimal(pricing?.originalTotal ?? pricing?.saleTotal ?? new Prisma.Decimal(line.price).mul(line.quantity));
      const hasDiscount = pricing?.originalPrice != null || pricing?.originalTotal != null;
      let afterDiscount = hasDiscount ? new Prisma.Decimal(pricing?.saleTotal ?? new Prisma.Decimal(line.price).mul(line.quantity)) : lineTotal;
      if (!hasDiscount && orderDiscount && orderItemSubtotal.gt(0) && line.quantity > 0) {
        const allocatedDiscount = Prisma.Decimal.min(lineTotal, orderDiscount.mul(lineTotal).div(orderItemSubtotal));
        afterDiscount = Prisma.Decimal.max(new Prisma.Decimal(0), lineTotal.minus(allocatedDiscount));
      }
      dump3.push([invoice, order.erpnextInvoiceId || "", line.productItem.sku || "", afterDiscount.toDecimalPlaces(2).toString(), payloadLineBrand(order.rawPayload, line.productItem.sku, index) || line.productItem.vendor?.name || "", order.companyLocation.name]);
      if (line.productItem.sku) itemList.push([line.productItem.sku, erp1TaxBySku.get(normalizeSkuKey(line.productItem.sku)) ?? "", erp2TaxBySku.get(normalizeSkuKey(line.productItem.sku)) ?? ""]);
    }
  }
  return { dump2, dump3, itemList, fromDate, toDate };
}
