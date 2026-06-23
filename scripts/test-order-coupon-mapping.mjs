/**
 * One-off: compare Shopify coupon mapping vs ERP Sales Invoice for a single order.
 * Usage: node scripts/test-order-coupon-mapping.mjs SV1008163
 */
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.vault") });
config({ path: resolve(process.cwd(), ".env") });

/** Mirrors lib/order-merchant-coupon.ts selection for Shopify web orders. */
function getMerchantCouponCode(discountCodes, assignedMerchantCouponCodes) {
  if (!Array.isArray(discountCodes) || discountCodes.length === 0) {
    const fallback = assignedMerchantCouponCodes?.find((c) => c?.trim());
    return fallback?.trim() ?? null;
  }
  if (discountCodes.length > 1) {
    const merCode = discountCodes.find((d) => {
      const c = typeof d?.code === "string" ? d.code.trim() : "";
      return c.toUpperCase().startsWith("MER");
    });
    if (merCode?.code?.trim()) return merCode.code.trim();
    const zeroCode = discountCodes.find((d) => {
      const amt = d?.amount;
      return (typeof amt === "string" && parseFloat(amt) === 0) || (typeof amt === "number" && amt === 0);
    });
    if (zeroCode?.code?.trim()) return zeroCode.code.trim();
  }
  const first = discountCodes[0];
  if (typeof first?.code === "string" && first.code.trim()) return first.code.trim();
  const fallback = assignedMerchantCouponCodes?.find((c) => c?.trim());
  return fallback?.trim() ?? null;
}

const orderName = process.argv[2] ?? "SV1008163";

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

function currentErpSyncCoupon(discountCodes) {
  if (!Array.isArray(discountCodes) || discountCodes.length === 0) return "SHOPIFY";
  const first = discountCodes[0];
  if (first && typeof first === "object" && typeof first.code === "string" && first.code.trim()) {
    return first.code.trim();
  }
  return "SHOPIFY";
}

function calcDiscountAmt(lineItems, shippingAmt, vaultTotal, useShippingInCalc) {
  const itemsTotal = lineItems.reduce((sum, li) => sum + Number(li.price) * li.quantity, 0);
  return parseFloat((itemsTotal + (useShippingInCalc ? shippingAmt : 0) - vaultTotal).toFixed(2));
}

async function fetchErpSi(inst, invoiceName) {
  const base = inst.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}`, {
    headers: { Authorization: `token ${inst.apiKey}:${inst.apiSecret}` },
  });
  if (!res.ok) return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return (await res.json()).data;
}

const order = await prisma.order.findFirst({
  where: { OR: [{ name: orderName }, { shopifyOrderId: orderName }, { erpnextInvoiceId: orderName }] },
  include: {
    lineItems: { include: { productItem: { select: { sku: true, productTitle: true } } } },
    assignedMerchant: { select: { couponCodes: true, name: true, email: true } },
    companyLocation: {
      include: {
        erpnextInstance: {
          select: {
            label: true,
            baseUrl: true,
            apiKey: true,
            apiSecret: true,
            shippingItem: true,
            shippingChargeAccount: true,
          },
        },
      },
    },
  },
});

if (!order) {
  console.error(`Order not found: ${orderName}`);
  process.exit(1);
}

const discountCodes =
  order.discountCodes ??
  (order.rawPayload && typeof order.rawPayload === "object"
    ? (order.rawPayload).discount_codes
    : null);

const vaultUiCoupon = getMerchantCouponCode(
  Array.isArray(discountCodes) ? discountCodes : null,
  order.assignedMerchant?.couponCodes ?? null,
);

const erpSyncCouponToday = currentErpSyncCoupon(
  Array.isArray(discountCodes) ? discountCodes : [],
);

const shippingAmt = order.totalShipping ? parseFloat(String(order.totalShipping)) : 0;
const inst = order.companyLocation?.erpnextInstance;
const hasShippingTaxRow = shippingAmt > 0 && !!inst?.shippingChargeAccount;
const hasShippingItem = shippingAmt > 0 && !!inst?.shippingItem && !hasShippingTaxRow;
const expectedDiscount = calcDiscountAmt(
  order.lineItems.map((li) => ({ price: li.price, quantity: li.quantity })),
  shippingAmt,
  parseFloat(String(order.totalPrice)),
  hasShippingTaxRow,
);

let erpSi = null;
if (order.erpnextInvoiceId && inst?.baseUrl && inst.apiKey && inst.apiSecret) {
  erpSi = await fetchErpSi(inst, order.erpnextInvoiceId);
}

const report = {
  order: {
    name: order.name,
    shopifyOrderId: order.shopifyOrderId,
    erpnextInvoiceId: order.erpnextInvoiceId,
    sourceName: order.sourceName,
    totalPrice: String(order.totalPrice),
    totalDiscounts: order.totalDiscounts != null ? String(order.totalDiscounts) : null,
    totalShipping: order.totalShipping != null ? String(order.totalShipping) : null,
    assignedMerchant: order.assignedMerchant
      ? { name: order.assignedMerchant.name, couponCodes: order.assignedMerchant.couponCodes }
      : null,
  },
  shopifyDiscountCodes: discountCodes,
  couponMapping: {
    vaultUiWouldShow: vaultUiCoupon,
    erpSyncSendsToday: erpSyncCouponToday,
    mismatch: vaultUiCoupon !== erpSyncCouponToday,
  },
  vaultLineItems: order.lineItems.map((li) => ({
    sku: li.productItem.sku,
    title: li.productItem.productTitle,
    qty: li.quantity,
    price: String(li.price),
    lineTotal: (Number(li.price) * li.quantity).toFixed(2),
  })),
  expectedErpPayload: {
    discount_amount: expectedDiscount,
    shippingConfigured: { shippingItem: inst?.shippingItem ?? null, shippingChargeAccount: inst?.shippingChargeAccount ?? null },
    shippingWouldSync: hasShippingItem || hasShippingTaxRow,
  },
  erpSalesInvoice: erpSi
    ? {
        name: erpSi.name,
        po_no: erpSi.po_no,
        grand_total: erpSi.grand_total,
        discount_amount: erpSi.discount_amount,
        custom_merchant_coupon_code: erpSi.custom_merchant_coupon_code,
        total_taxes_and_charges: erpSi.total_taxes_and_charges,
        items: (erpSi.items ?? []).map((i) => ({
          item_code: i.item_code,
          qty: i.qty,
          rate: i.rate,
          amount: i.amount,
        })),
        taxes: (erpSi.taxes ?? []).map((t) => ({
          description: t.description,
          tax_amount: t.tax_amount,
        })),
      }
    : { skipped: "no invoice id or ERP credentials" },
  diagnosis: [],
};

if (report.couponMapping.mismatch) {
  report.diagnosis.push(
    `ERP sync would send "${erpSyncCouponToday}" but Vault UI shows "${vaultUiCoupon}".`,
  );
}
if (erpSi && erpSi.custom_merchant_coupon_code !== vaultUiCoupon) {
  report.diagnosis.push(
    `ERP invoice has coupon "${erpSi.custom_merchant_coupon_code}" — expected "${vaultUiCoupon ?? "SHOPIFY"}".`,
  );
}
if (erpSi && Number(erpSi.discount_amount || 0) !== expectedDiscount) {
  report.diagnosis.push(
    `ERP discount_amount is ${erpSi.discount_amount ?? 0}; Vault calculated ${expectedDiscount} from Shopify total.`,
  );
}
if (erpSi && Math.abs(Number(erpSi.grand_total) - Number(order.totalPrice)) > 0.01) {
  report.diagnosis.push(
    `Grand total mismatch: ERP ${erpSi.grand_total} vs Vault/Shopify ${order.totalPrice}.`,
  );
}
if (!report.expectedErpPayload.shippingWouldSync && shippingAmt > 0) {
  report.diagnosis.push(
    `Shipping LKR ${shippingAmt} not configured to sync (set shippingItem or shippingChargeAccount on ERP instance).`,
  );
}

console.log(JSON.stringify(report, null, 2));

await prisma.$disconnect();
