import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
import { getShadowSourceLocationId } from "@/lib/shadow-location-products";
import { erpnextSalesInvoiceWebhookSchema } from "@/lib/validation/erpnext-sales-invoice";
import {
  isOrderPaymentRequiresApproval,
  createOrGetOrderPaymentApproval,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { eligibleMerchantUserWhere } from "@/lib/merchant-eligibility";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  // against an existing invoice, flip the original order to the "returned" stage so it shows
  // as a returned order in Cosmo OS / Vault OS (same codebase, both deployments).
  // Detected by is_return=1 OR negative grand_total (some ERP setups omit is_return).
  if (
    data.is_return === 1 ||
    (data.grand_total != null && data.grand_total < 0)
  ) {
    const returnAgainst = data.return_against?.trim() || null;
    if (returnAgainst) {
      // The original SI name is stored on the order as erpnextInvoiceId for both
      // ERP-origin orders and Shopify-origin orders synced to ERP. Match defensively.
      const original = await prisma.order.findFirst({
        where: {
          OR: [
            { erpnextInvoiceId: returnAgainst },
            { name: returnAgainst },
            { shopifyOrderId: `erp-${returnAgainst}` },
          ],
        },
        select: { id: true, name: true },
      });
      if (original) {
        await prisma.order.update({
          where: { id: original.id },
          data: { fulfillmentStage: "returned" },
        });
        console.log(
          `[ERPNext webhook] Credit note ${data.name} — marked order ${original.name} as returned (return_against=${returnAgainst})`,
        );
        return NextResponse.json({
          ok: true,
          returned: true,
          orderId: original.id,
        });
      }
      console.warn(
        `[ERPNext webhook] Credit note ${data.name} — no original order found for return_against=${returnAgainst}`,
      );
    }

    // Fallback: if a credit-note-named order somehow already exists, void it so it
    // leaves the print queue (no original invoice link available).
    const existing = await prisma.order.findUnique({
      where: { shopifyOrderId: erpInvoiceId },
      select: { id: true },
    });
    if (existing) {
      await prisma.order.update({
        where: { id: existing.id },
        data: { financialStatus: "voided" },
      });
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

  // Skip if po_no matches a Shopify-originated order (not our own ERP order)
  if (data.po_no?.trim()) {
    const shopifyOrder = await prisma.order.findFirst({
      where: {
        OR: [
          { name: data.po_no.trim() },
          { shopifyOrderId: data.po_no.trim() },
        ],
        sourceName: { not: "erpnext" },
      },
      select: { id: true },
    });
    if (shopifyOrder) {
      console.log(
        `[ERPNext webhook] Invoice ${data.name} matches Shopify order (po_no=${data.po_no}) — skipping`,
      );
      return NextResponse.json({ ok: true, skipped: true });
    }
  }

  // Find location — prefer warehouse match, fall back to company match
  const location = await (async () => {
    if (data.set_warehouse) {
      const byWarehouse = await prisma.companyLocation.findFirst({
        where: {
          erpnextWarehouse: data.set_warehouse,
          erpnextCompany: data.company,
        },
        select: {
          id: true,
          companyId: true,
          defaultMerchantUserId: true,
          shadowParentLocationId: true,
          shopifyLocationId: true,
        },
      });
      if (byWarehouse) return byWarehouse;
    }
    return prisma.companyLocation.findFirst({
      where: { erpnextCompany: data.company },
      select: {
        id: true,
        companyId: true,
        defaultMerchantUserId: true,
        shadowParentLocationId: true,
        shopifyLocationId: true,
      },
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
  const erpCustomerName = nullIfNone(data.customer_name) ?? data.customer;

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
  const merCouponCode = data.custom_merchant_coupon_code?.trim() || null;

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

  const order = await prisma.order.upsert({
    where: { shopifyOrderId: erpInvoiceId },
    create: {
      companyId: location.companyId,
      companyLocationId: location.id,
      shopifyOrderId: erpInvoiceId,
      sourceName: isPOS ? "erpnext-pos" : "erpnext",
      name: data.name,
      erpnextInvoiceId: data.name,
      totalPrice: grandTotal,
      currency: data.currency ?? "LKR",
      financialStatus,
      fulfillmentStage: isPOS ? "delivery_complete" : "print",
      customerEmail,
      customerPhone,
      shippingAddress: shippingAddressObj,
      rawPayload: rawPayload as object,
      ...(merCouponCode ? { discountCodes: [{ code: merCouponCode }] } : {}),
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
      financialStatus,
      erpnextInvoiceId: data.name,
      sourceName: isPOS ? "erpnext-pos" : "erpnext",
      ...(isPOS ? { fulfillmentStage: "delivery_complete" } : {}),
      customerEmail,
      customerPhone,
      shippingAddress: shippingAddressObj,
      rawPayload: rawPayload as object,
      ...(merCouponCode ? { discountCodes: [{ code: merCouponCode }] } : {}),
      ...(resolvedPaymentMethods.length > 0
        ? {
            paymentGatewayNames: resolvedPaymentMethods,
            paymentGatewayPrimary: resolvedPaymentMethods[0],
          }
        : {}),
      ...(assignedMerchantId ? { assignedMerchantId } : {}),
    },
    select: { id: true, name: true },
  });

  // For non-POS ERP orders: if payment requires approval and is unpaid, create an approval
  // request. The print/dispatch queue filters already exclude orders with pending approvals,
  // so no stage change is needed — the order is blocked automatically until finance approves.
  if (!isPOS && financialStatus !== "paid") {
    const needsApproval = isOrderPaymentRequiresApproval({
      paymentGatewayPrimary: resolvedPaymentMethods[0] ?? null,
      paymentGatewayNames: resolvedPaymentMethods,
    });
    if (needsApproval) {
      const existingApproval = await prisma.approvalRequest.findFirst({
        where: {
          orderId: order.id,
          type: ORDER_PAYMENT_APPROVAL,
          status: "pending",
        },
        select: { id: true },
      });
      if (!existingApproval) {
        void createOrGetOrderPaymentApproval({
          companyId: location.companyId,
          orderId: order.id,
          requestedById: null,
          invoiceLabel: order.name ?? data.name,
          paymentType: resolvedPaymentMethods[0] ?? "bank transfer",
          amount: grandTotal.toString(),
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

      let productItem = await prisma.productItem.findFirst({
        where: { companyLocationId: location.id, sku: item.item_code },
        select: { id: true },
      });

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
            price: new Decimal(item.rate),
            categoryId: category.id,
            itemStatusCategory: "NEWLY_ADDED",
            itemStatusLabel: "Newly Added",
            inventoryQuantity: 0,
          },
          update: {},
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
