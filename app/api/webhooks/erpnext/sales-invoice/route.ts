import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
import { getShadowSourceLocationId } from "@/lib/shadow-location-products";
import { erpnextSalesInvoiceWebhookSchema } from "@/lib/validation/erpnext-sales-invoice";
import {
  isOrderPaymentRequiresApproval,
  createOrGetOrderPaymentApproval,
  cancelPendingApprovalsForOrder,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { eligibleMerchantUserWhere } from "@/lib/merchant-eligibility";
import { resolveErpWebhookCustomerName } from "@/lib/erpnext-customer-display-name";
import { findBarcodeForSku } from "@/lib/product-item-barcode.server";
import { erpInvoiceReferenceLookupValues } from "@/lib/erp-invoice-reference";
import {
  handleErpSalesInvoiceCreditNoteEvent,
  isErpReturnSalesInvoice,
  isErpSalesInvoiceCreditNoted,
} from "@/lib/erp-credit-note-order-sync";
import { buildErpOrderShippingFields } from "@/lib/order-shipping-display";
import { buildErpOrderDiscountCodes } from "@/lib/order-discount-coupon";
import { orderStageUpdate } from "@/lib/order-stage-timing";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Vault order linked to this ERP SI via po_no or erpnextInvoiceId (Shopify/web/manual — not erpnext-native rows). */
async function findLinkedVaultOrderForErpInvoice(data: {
  name: string;
  po_no?: string | null;
}) {
  const poNo = data.po_no?.trim();
  const invoiceRef = data.name.trim();
  const invoiceRefs = erpInvoiceReferenceLookupValues(invoiceRef);

  return prisma.order.findFirst({
    where: {
      OR: [
        ...(poNo
          ? [{ name: poNo }, { shopifyOrderId: poNo }, { orderNumber: poNo }]
          : []),
        { erpnextInvoiceId: invoiceRef },
        ...invoiceRefs.map((ref) => ({ erpnextInvoiceId: ref })),
      ],
      sourceName: { notIn: ["erpnext", "erpnext-pos"] },
    },
    select: { id: true, name: true, orderNumber: true },
  });
}

// Fetches pos_profile and first-item warehouse from the Sales Invoice via ERPNext API.
// Used as a fallback when the webhook payload doesn't include these fields (e.g. Cosmetics.lk
// sends set_warehouse="None" and omits pos_profile from the webhook body).
async function fetchPosDetailsFromSalesInvoice(
  invoiceName: string,
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
): Promise<{ posProfile: string | null; warehouse: string | null }> {
  if (!baseUrl || !apiKey || !apiSecret) return { posProfile: null, warehouse: null };
  try {
    const fields = encodeURIComponent(JSON.stringify(["pos_profile", "items.warehouse"]));
    const res = await fetch(
      `${baseUrl}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}?fields=${fields}`,
      { headers: { Authorization: `token ${apiKey}:${apiSecret}` } },
    );
    if (!res.ok) return { posProfile: null, warehouse: null };
    const json = (await res.json()) as {
      data: { pos_profile?: string; items?: { warehouse?: string }[] };
    };
    const posProfile = json.data?.pos_profile?.trim() || null;
    const warehouse = json.data?.items?.[0]?.warehouse?.trim() || null;
    return { posProfile, warehouse };
  } catch {
    return { posProfile: null, warehouse: null };
  }
}

async function fetchOutstandingAmount(
  invoiceName: string,
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
): Promise<number | null> {
  if (!baseUrl || !apiKey || !apiSecret) return null;
  try {
    const fields = encodeURIComponent(JSON.stringify(["outstanding_amount"]));
    const res = await fetch(
      `${baseUrl}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}?fields=${fields}`,
      { headers: { Authorization: `token ${apiKey}:${apiSecret}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data: { outstanding_amount: number } };
    return json.data.outstanding_amount ?? null;
  } catch {
    return null;
  }
}

async function resolveInstanceSecret(company: string): Promise<{
  secret: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
} | null> {
  // Try to find a location with an erpnextInstance linked to this company
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: company },
    select: {
      erpnextInstance: {
        select: {
          incomingWebhookSecret: true,
          baseUrl: true,
          apiKey: true,
          apiSecret: true,
        },
      },
    },
  });

  const instance = location?.erpnextInstance;
  if (instance) {
    return {
      secret:
        instance.incomingWebhookSecret ??
        process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ??
        "",
      baseUrl: instance.baseUrl.replace(/\/$/, ""),
      apiKey: instance.apiKey,
      apiSecret: instance.apiSecret,
    };
  }

  // Fall back to env vars
  const envSecret = process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
  const envBaseUrl = (process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
  if (!envSecret && !envBaseUrl) return null;
  return {
    secret: envSecret,
    baseUrl: envBaseUrl,
    apiKey: process.env.ERPNEXT_API_KEY ?? "",
    apiSecret: process.env.ERPNEXT_API_SECRET ?? "",
  };
}

export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ERPNext can send data at root level OR nested under a "data" key — handle both
  const topLevel = rawPayload as Record<string, unknown>;
  console.log("[ERPNext webhook] top-level keys:", Object.keys(topLevel));
  if (topLevel?.data && typeof topLevel.data === "object") {
    console.log(
      "[ERPNext webhook] data keys:",
      Object.keys(topLevel.data as object),
    );
  }
  const unwrapped: Record<string, unknown> =
    topLevel?.data !== null &&
    typeof topLevel?.data === "object" &&
    !Array.isArray(topLevel?.data)
      ? (topLevel.data as Record<string, unknown>)
      : topLevel;

  const companyRaw = unwrapped?.company;
  const company = typeof companyRaw === "string" ? companyRaw : "";
  console.log("[ERPNext webhook] resolved company:", JSON.stringify(company));

  const instanceCreds = await resolveInstanceSecret(company);
  if (
    !instanceCreds ||
    !instanceCreds.secret ||
    incomingSecret !== instanceCreds.secret
  ) {
    console.error(
      "[ERPNext webhook] Invalid or missing secret for company:",
      company,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextSalesInvoiceWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    console.error(
      "[ERPNext webhook] Validation failed",
      parsed.error.flatten(),
    );
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Only process submitted (1) or cancelled (2) — ignore drafts
  if (!data.docstatus || data.docstatus === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const erpInvoiceId = `erp-${data.name}`;

  // Credit notes (return invoices) reverse a Sales Invoice. When ERP issues a credit note
  // against an existing invoice, void the original order and move it to "returned".
  const creditNoteResult = await handleErpSalesInvoiceCreditNoteEvent(data);
  if (creditNoteResult.handled) {
    console.log(
      `[ERPNext webhook] Credit note event for ${data.name} — marked order as returned`,
      { orderId: creditNoteResult.orderId },
    );
    return NextResponse.json({
      ok: true,
      returned: true,
      orderId: creditNoteResult.orderId,
    });
  }

  if (
    data.is_return === 1 ||
    (data.grand_total != null && data.grand_total < 0) ||
    data.return_against?.trim()
  ) {
    // Return SI without a matching Vault order — void a stray credit-note row if present.
    const existing = await prisma.order.findUnique({
      where: { shopifyOrderId: erpInvoiceId },
      select: { id: true },
    });
    if (existing) {
      await prisma.order.update({
        where: { id: existing.id },
        data: { financialStatus: "voided" },
      });
      await cancelPendingApprovalsForOrder(existing.id);
      console.log(
        `[ERPNext webhook] Credit note ${data.name} — voided existing order ${existing.id}`,
      );
    } else {
      console.log(
        `[ERPNext webhook] Credit note ${data.name} — skipped (no matching order)`,
      );
    }
    return NextResponse.json({ ok: true, skipped: true });
  }

  const isPOS =
    data.is_pos === 1 ||
    (!!data.posa_pos_opening_shift && data.posa_pos_opening_shift !== "None");
  const isFullyPaid =
    typeof data.outstanding_amount === "number" && data.outstanding_amount <= 0;
  let financialStatus: string;
  if (data.docstatus === 2) {
    financialStatus = "voided";
  } else if (isPOS || isFullyPaid) {
    // POS orders and fully paid invoices (outstanding_amount = 0) are marked paid
    financialStatus = "paid";
  } else {
    // Non-POS ERP invoice: pending until PE webhook marks it paid
    financialStatus = "pending";
  }

  // Shopify/web orders already live in Vault — skip ERP-native upsert, but honour cancellations.
  const linkedVaultOrder = await findLinkedVaultOrderForErpInvoice(data);
  if (linkedVaultOrder) {
    if (data.docstatus === 2) {
      await prisma.order.update({
        where: { id: linkedVaultOrder.id },
        data: { financialStatus: "voided" },
      });
      await cancelPendingApprovalsForOrder(linkedVaultOrder.id);
      console.log(
        `[ERPNext webhook] Cancelled invoice ${data.name} — voided Vault order ${linkedVaultOrder.name ?? linkedVaultOrder.orderNumber ?? linkedVaultOrder.id}`,
      );
      return NextResponse.json({
        ok: true,
        voided: true,
        orderId: linkedVaultOrder.id,
      });
    }
    console.log(
      `[ERPNext webhook] Invoice ${data.name} matches Vault order (po_no=${data.po_no ?? "—"}) — skipping ERP upsert`,
    );
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Find location — match by warehouse field, then warehouse list, then company fallback
  const locationSelect = {
    id: true,
    companyId: true,
    defaultMerchantUserId: true,
    shadowParentLocationId: true,
    shopifyLocationId: true,
  } as const;
  const location = await (async () => {
    if (data.set_warehouse) {
      // 1. Primary field match (single-warehouse locations)
      const byField = await prisma.companyLocation.findFirst({
        where: { erpnextWarehouse: data.set_warehouse, erpnextCompany: data.company },
        select: locationSelect,
      });
      if (byField) return byField;
      // 2. Warehouse list match (multi-warehouse locations)
      const byList = await prisma.companyLocation.findFirst({
        where: {
          erpnextCompany: data.company,
          erpWarehouses: { some: { warehouse: data.set_warehouse } },
        },
        select: locationSelect,
      });
      if (byList) return byList;
    }
    // 3. Company-only fallback
    return prisma.companyLocation.findFirst({
      where: { erpnextCompany: data.company },
      select: locationSelect,
    });
  })();
  if (!location) {
    console.error(
      `[ERPNext webhook] No location found for company="${data.company}" warehouse="${data.set_warehouse ?? ""}"`,
    );
    return NextResponse.json(
      {
        error: `No vault os location mapped to ERPNext company "${data.company}"`,
      },
      { status: 422 },
    );
  }

  const grandTotal = new Decimal(data.grand_total ?? 0);
  const isReturnCreditNote = isErpReturnSalesInvoice(
    data.is_return,
    data.grand_total ?? null,
    data.return_against,
  );
  const nullIfNone = (v: string | null | undefined) => {
    const s = v?.trim();
    return !s || s.toLowerCase() === "none" ? null : s;
  };
  const customerEmail = nullIfNone(data.contact_email);
  const customerPhone = nullIfNone(data.contact_mobile);

  function parseErpAddress(
    html: string | null | undefined,
    customerName: string,
  ): object {
    if (!html?.trim()) return { name: customerName };
    // Strip HTML tags, split on <br> variants into lines
    const lines = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Skip leading line if it's the customer name (ERP sometimes prepends it)
    const addrLines =
      lines[0]?.toLowerCase() === customerName.toLowerCase()
        ? lines.slice(1)
        : lines;
    return {
      name: customerName,
      address1: addrLines[0] ?? null,
      address2: addrLines.length > 2 ? addrLines[1] : null,
      city: addrLines.length > 1 ? addrLines[addrLines.length - 2] : null,
      country: addrLines.length > 1 ? addrLines[addrLines.length - 1] : null,
    };
  }

  // Prefer ERPNext's display name (customer_name); fall back to the customer ID
  // (which is often just a phone number when customers are keyed by mobile).
  const customerNameResolution = await resolveErpWebhookCustomerName(data, {
    baseUrl: instanceCreds.baseUrl,
    apiKey: instanceCreds.apiKey,
    apiSecret: instanceCreds.apiSecret,
  });
  const erpCustomerName = customerNameResolution.name;
  console.log(
    `[ERPNext webhook] customer_name in payload: ${customerNameResolution.webhookCustomerName ?? "(missing)"}; ` +
      `resolved display name: ${erpCustomerName} (source: ${customerNameResolution.source})`,
  );

  const shippingAddressObj = parseErpAddress(
    nullIfNone(data.shipping_address) ?? nullIfNone(data.address_display),
    erpCustomerName,
  );

  // Try to match the owner (cashier for POS, merchant for non-POS) to a vault os user
  // Fall back to location default merchant
  let assignedMerchantId: string | undefined =
    location.defaultMerchantUserId ?? undefined;
  if (data.owner?.trim()) {
    const erpUser = await prisma.user.findUnique({
      where: { erpnextUsername: data.owner.trim() },
      select: { id: true },
    });
    if (erpUser) assignedMerchantId = erpUser.id;
  }

  // Read merchant coupon code directly from ERP invoice — stored as-is for display
  const merCouponCode =
    data.custom_merchant_coupon_code?.trim() ||
    data.merchant_coupon_code?.trim() ||
    null;
  const erpDiscountCodes = buildErpOrderDiscountCodes({
    coupon_code: data.coupon_code,
    custom_coupon_code: data.custom_coupon_code,
    custom_merchant_coupon_code: data.custom_merchant_coupon_code,
    merchant_coupon_code: data.merchant_coupon_code,
  });

  // For non-POS ERP orders: if a coupon code is present, try to assign the merchant via
  // coupon code (same logic as Shopify web order assignment in resolveAssignedMerchant).
  // This makes AE/Origin ERP orders behave the same as SupplementVault.lk web orders.
  if (!isPOS && merCouponCode) {
    const couponLower = merCouponCode.toLowerCase();
    const merchants = await prisma.user.findMany({
      where: eligibleMerchantUserWhere(location.companyId),
      select: { id: true, couponCodes: true },
    });
    const match = merchants.find((m) =>
      m.couponCodes.some((c) => c.toLowerCase().trim() === couponLower)
    );
    if (match) assignedMerchantId = match.id;
  }

  const posPaymentMethods = isPOS
    ? data.payments.map((p) => p.mode_of_payment).filter(Boolean)
    : [];

  // Resolve payment gateway: POS uses payments[] array; non-POS uses custom_payment_type (falls back to payment_type)
  // Filter out ERPNext's literal "None" default value
  const cleanPaymentType =
    (data.custom_payment_type?.trim() || data.payment_type?.trim()) ?? "";
  const resolvedPaymentMethods =
    posPaymentMethods.length > 0
      ? posPaymentMethods
      : cleanPaymentType && cleanPaymentType.toLowerCase() !== "none"
        ? [cleanPaymentType]
        : [];

  // For POS orders: resolve pos_profile and warehouse.
  // 1. Use pos_profile from payload if present (once ERPNext webhook is updated to send it).
  // 2. Use set_warehouse from payload if it's not "None".
  // 3. Fall back to first item's warehouse (items.warehouse in the payload, if webhook sends it).
  // 4. If still missing, fetch from ERPNext API (Cosmetics.lk sends set_warehouse="None" and
  //    omits pos_profile from the webhook body, but the Sales Invoice API returns both).
  let resolvedPosProfile: string | null = data.pos_profile ?? null;
  let resolvedPosWarehouse: string | null =
    data.set_warehouse && data.set_warehouse.toLowerCase() !== "none" && data.set_warehouse.trim()
      ? data.set_warehouse.trim()
      : null;

  // Check item-level warehouse as first fallback (populated if webhook sends items.warehouse)
  if (!resolvedPosWarehouse && data.items.length > 0) {
    const firstItemWarehouse = data.items[0].warehouse?.trim();
    if (firstItemWarehouse && firstItemWarehouse.toLowerCase() !== "none") {
      resolvedPosWarehouse = firstItemWarehouse;
    }
  }

  if (isPOS && (!resolvedPosProfile || !resolvedPosWarehouse)) {
    const fromSI = await fetchPosDetailsFromSalesInvoice(
      data.name,
      instanceCreds.baseUrl,
      instanceCreds.apiKey,
      instanceCreds.apiSecret,
    );
    if (!resolvedPosProfile && fromSI.posProfile) {
      resolvedPosProfile = fromSI.posProfile;
      console.log(`[ERPNext webhook] Fetched pos_profile="${resolvedPosProfile}" from ERP API for ${data.name}`);
    }
    if (!resolvedPosWarehouse && fromSI.warehouse) {
      resolvedPosWarehouse = fromSI.warehouse;
      console.log(`[ERPNext webhook] Fetched warehouse="${resolvedPosWarehouse}" from ERP API for ${data.name}`);
    }
  }

  const isCreditNoted =
    isErpSalesInvoiceCreditNoted(data.status, data.docstatus) || isReturnCreditNote || grandTotal.lt(0);

  const erpShipping = buildErpOrderShippingFields({
    shipping_rule: data.shipping_rule,
    taxes: data.taxes,
    total_taxes_and_charges: data.total_taxes_and_charges,
  });

  const lineDiscountSum = data.items.reduce(
    (acc, item) => acc + (item.discount_amount ?? 0),
    0,
  );
  const totalDiscountsValue =
    lineDiscountSum > 0
      ? lineDiscountSum
      : data.discount_amount != null && data.discount_amount > 0
        ? data.discount_amount
        : null;
  const subtotalPriceValue =
    data.net_total != null && data.net_total > 0 ? data.net_total : null;
  const pricingFields = {
    ...(subtotalPriceValue != null
      ? { subtotalPrice: new Decimal(subtotalPriceValue) }
      : {}),
    ...(totalDiscountsValue != null
      ? { totalDiscounts: new Decimal(totalDiscountsValue) }
      : {}),
  };

  // POS orders are completed at the counter (paid + delivered) — close fulfillment so they
  // never appear on the manual invoice-complete queue. Regular ERP orders start at
  // order_received so staff can add samples before advancing to print.
  const posCompletedAt = isPOS ? new Date() : undefined;
  const posCounterSaleCompletion =
    isPOS && !isCreditNoted && posCompletedAt
      ? {
          ...orderStageUpdate("invoice_complete", posCompletedAt),
          fulfillmentStatus: "fulfilled" as const,
          deliveryOutcome: "delivered" as const,
          deliveryCompleteAt: posCompletedAt,
          invoiceCompleteAt: posCompletedAt,
          sampleFreeIssueCompleteAt: posCompletedAt,
        }
      : null;

  const order = await prisma.order.upsert({
    where: { shopifyOrderId: erpInvoiceId },
    create: {
      companyId: location.companyId,
      companyLocationId: location.id,
      shopifyOrderId: erpInvoiceId,
      sourceName: isPOS ? "erpnext-pos" : "erpnext",
      name: data.name,
      erpnextInvoiceId: data.name,
      erpnextWarehouse: resolvedPosWarehouse ?? data.set_warehouse ?? null,
      posProfile: resolvedPosProfile,
      totalPrice: grandTotal,
      ...pricingFields,
      ...(erpShipping.totalShipping
        ? { totalShipping: new Decimal(erpShipping.totalShipping) }
        : {}),
      ...(erpShipping.shippingLines ? { shippingLines: erpShipping.shippingLines } : {}),
      currency: data.currency ?? "LKR",
      financialStatus: isCreditNoted ? "voided" : financialStatus,
      ...(isCreditNoted
        ? orderStageUpdate("returned", posCompletedAt ?? new Date())
        : posCounterSaleCompletion
          ? posCounterSaleCompletion
          : orderStageUpdate("order_received", new Date())),
      customerEmail,
      customerPhone,
      shippingAddress: shippingAddressObj,
      rawPayload: rawPayload as object,
      ...(erpDiscountCodes ? { discountCodes: erpDiscountCodes } : {}),
      ...(resolvedPaymentMethods.length > 0
        ? {
            paymentGatewayNames: resolvedPaymentMethods,
            paymentGatewayPrimary: resolvedPaymentMethods[0],
          }
        : {}),
      ...(assignedMerchantId ? { assignedMerchantId } : {}),
    },
    update: {
      totalPrice: grandTotal,
      ...pricingFields,
      ...(erpShipping.totalShipping
        ? { totalShipping: new Decimal(erpShipping.totalShipping) }
        : {}),
      ...(erpShipping.shippingLines ? { shippingLines: erpShipping.shippingLines } : {}),
      financialStatus: isCreditNoted ? "voided" : financialStatus,
      erpnextInvoiceId: data.name,
      erpnextWarehouse: resolvedPosWarehouse ?? data.set_warehouse ?? null,
      posProfile: resolvedPosProfile,
      erpnextSyncError: null,
      sourceName: isPOS ? "erpnext-pos" : "erpnext",
      ...(isCreditNoted ? orderStageUpdate("returned", new Date()) : {}),
      customerEmail,
      customerPhone,
      shippingAddress: shippingAddressObj,
      rawPayload: rawPayload as object,
      ...(erpDiscountCodes ? { discountCodes: erpDiscountCodes } : {}),
      ...(resolvedPaymentMethods.length > 0
        ? {
            paymentGatewayNames: resolvedPaymentMethods,
            paymentGatewayPrimary: resolvedPaymentMethods[0],
          }
        : {}),
      ...(assignedMerchantId ? { assignedMerchantId } : {}),
    },
    select: { id: true, name: true, paymentGatewayPrimary: true, paymentGatewayNames: true, financialStatus: true },
  });

  // Backfill counter-sale completion for existing ERP POS rows that landed at
  // delivery_complete without invoiceCompleteAt (they used to clog invoice-complete).
  if (posCounterSaleCompletion) {
    await prisma.order.updateMany({
      where: { id: order.id, invoiceCompleteAt: null },
      data: posCounterSaleCompletion,
    });
  }

  if (financialStatus === "voided" || isCreditNoted) {
    await cancelPendingApprovalsForOrder(order.id);
  }

  // For non-POS ERP orders: if payment requires approval and is unpaid, create an approval
  // request. The print/dispatch queue filters already exclude orders with pending approvals,
  // so no stage change is needed — the order is blocked automatically until finance approves.
  // Use the stored order payment gateway (post-upsert) rather than resolvedPaymentMethods from
  // the current ERP payload — the ERP invoice may omit custom_payment_type (sending "None") on
  // subsequent webhook fires (e.g. after cancel/resubmit), but the OS order already has the
  // correct payment gateway from the first webhook fire that set it.
  if (!isPOS && financialStatus !== "paid" && financialStatus !== "voided") {
    const needsApproval = isOrderPaymentRequiresApproval({
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames,
    });
    // Skip if the OS order is already paid — payment was confirmed via finance approval or
    // payment method change; the ERP invoice may still be "Unpaid" until a PE is posted.
    const osOrderAlreadyPaid = order.financialStatus === "paid";
    if (needsApproval && !osOrderAlreadyPaid) {
      const existingApproval = await prisma.approvalRequest.findFirst({
        where: {
          orderId: order.id,
          type: ORDER_PAYMENT_APPROVAL,
          status: "pending",
        },
        select: { id: true },
      });
      if (!existingApproval) {
        await createOrGetOrderPaymentApproval({
          companyId: location.companyId,
          orderId: order.id,
          requestedById: null,
          invoiceLabel: order.name ?? data.name,
          paymentType: order.paymentGatewayPrimary ?? resolvedPaymentMethods[0] ?? "bank transfer",
          amount: grandTotal.toString(),
          companyLocationId: location.id,
        }).catch((err) =>
          console.error("[ERP webhook] approval creation failed:", err),
        );
      }
    }
  }

  // Rebuild line items on every save
  if (data.items.length > 0) {
    await prisma.orderLineItem.deleteMany({ where: { orderId: order.id } });

    for (const [idx, item] of data.items.entries()) {
      if (!item.item_code) continue;

      const erpBarcodeConfig = {
        baseUrl: instanceCreds.baseUrl,
        apiKey: instanceCreds.apiKey,
        apiSecret: instanceCreds.apiSecret,
      };

      let productItem = await prisma.productItem.findFirst({
        where: { companyLocationId: location.id, sku: item.item_code },
        select: { id: true, barcode: true },
      });

      let barcode: string | null = productItem?.barcode ?? null;
      if (!barcode) {
        barcode = await findBarcodeForSku(location.companyId, item.item_code, {
          erpConfig: erpBarcodeConfig,
        });
      }

      if (!productItem) {
        const category = await prisma.category.upsert({
          where: {
            companyId_name: {
              companyId: location.companyId,
              name: "Uncategorized",
            },
          },
          create: { companyId: location.companyId, name: "Uncategorized" },
          update: {},
        });
        const syntheticVariantId = `erp-${item.item_code}`;
        productItem = await prisma.productItem.upsert({
          where: {
            companyLocationId_shopifyVariantId: {
              companyLocationId: location.id,
              shopifyVariantId: syntheticVariantId,
            },
          },
          create: {
            companyId: location.companyId,
            companyLocationId: location.id,
            shopifyLocationId: location.shopifyLocationId ?? location.id,
            shopifyProductId: syntheticVariantId,
            shopifyVariantId: syntheticVariantId,
            productTitle: (item.item_name ?? item.item_code).slice(0, 255),
            sku: item.item_code,
            barcode: barcode?.slice(0, 100) ?? null,
            price: new Decimal(item.rate),
            categoryId: category.id,
            itemStatusCategory: "NEWLY_ADDED",
            itemStatusLabel: "Newly Added",
            inventoryQuantity: 0,
          },
          update: {
            ...(barcode ? { barcode: barcode.slice(0, 100) } : {}),
          },
        });
      } else if (barcode && !productItem.barcode) {
        await prisma.productItem.update({
          where: { id: productItem.id },
          data: { barcode: barcode.slice(0, 100) },
        });
      }

      await prisma.orderLineItem.create({
        data: {
          orderId: order.id,
          productItemId: productItem.id,
          shopifyLineItemId: `erp-${data.name}-${idx}`,
          quantity: Math.round(item.qty),
          price: new Decimal(item.rate),
        },
      });
    }
  }

  console.log(
    `[ERPNext webhook] Upserted vault os order ${order.name} (${financialStatus}) from ERPNext invoice ${data.name}`,
  );
  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderName: order.name,
    financialStatus,
  });
}
