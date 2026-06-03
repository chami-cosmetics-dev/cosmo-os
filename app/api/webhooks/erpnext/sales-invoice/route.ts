import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
import { getShadowSourceLocationId } from "@/lib/shadow-location-products";
import { erpnextSalesInvoiceWebhookSchema } from "@/lib/validation/erpnext-sales-invoice";

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
      secret: instance.incomingWebhookSecret ?? process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "",
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
    console.log("[ERPNext webhook] data keys:", Object.keys(topLevel.data as object));
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
  if (!instanceCreds || !instanceCreds.secret || incomingSecret !== instanceCreds.secret) {
    console.error("[ERPNext webhook] Invalid or missing secret for company:", company);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextSalesInvoiceWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    console.error("[ERPNext webhook] Validation failed", parsed.error.flatten());
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
  const isPOS = data.is_pos === 1;
  const isFullyPaid = typeof data.outstanding_amount === "number" && data.outstanding_amount <= 0;
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
      console.log(`[ERPNext webhook] Invoice ${data.name} matches Shopify order (po_no=${data.po_no}) — skipping`);
      return NextResponse.json({ ok: true, skipped: true });
    }
  }

  // Find location — prefer warehouse match, fall back to company match
  const location = await (async () => {
    if (data.set_warehouse) {
      const byWarehouse = await prisma.companyLocation.findFirst({
        where: { erpnextWarehouse: data.set_warehouse, erpnextCompany: data.company },
        select: { id: true, companyId: true, defaultMerchantUserId: true, shadowParentLocationId: true, shopifyLocationId: true },
      });
      if (byWarehouse) return byWarehouse;
    }
    return prisma.companyLocation.findFirst({
      where: { erpnextCompany: data.company },
      select: { id: true, companyId: true, defaultMerchantUserId: true, shadowParentLocationId: true, shopifyLocationId: true },
    });
  })();
  if (!location) {
    console.error(`[ERPNext webhook] No location found for company="${data.company}" warehouse="${data.set_warehouse ?? ""}"`);
    return NextResponse.json(
      { error: `No vault os location mapped to ERPNext company "${data.company}"` },
      { status: 422 },
    );
  }

  const grandTotal = new Decimal(data.grand_total ?? 0);
  const customerEmail = data.contact_email?.trim() || null;
  const customerPhone = data.contact_mobile?.trim() || null;

  function parseErpAddress(html: string | null | undefined, customerName: string): object {
    if (!html?.trim()) return { name: customerName };
    // Strip HTML tags, split on <br> variants into lines
    const lines = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Skip leading line if it's the customer name (ERP sometimes prepends it)
    const addrLines = lines[0]?.toLowerCase() === customerName.toLowerCase() ? lines.slice(1) : lines;
    return {
      name: customerName,
      address1: addrLines[0] ?? null,
      address2: addrLines.length > 2 ? addrLines[1] : null,
      city: addrLines.length > 1 ? addrLines[addrLines.length - 2] : null,
      country: addrLines.length > 1 ? addrLines[addrLines.length - 1] : null,
    };
  }

  const shippingAddressObj = parseErpAddress(data.shipping_address ?? data.address_display, data.customer);

  // Try to match the owner (cashier for POS, merchant for non-POS) to a vault os user
  // Fall back to location default merchant
  let assignedMerchantId: string | undefined = location.defaultMerchantUserId ?? undefined;
  if (data.owner?.trim()) {
    const erpUser = await prisma.user.findUnique({
      where: { erpnextUsername: data.owner.trim() },
      select: { id: true },
    });
    if (erpUser) assignedMerchantId = erpUser.id;
  }

  const posPaymentMethods = isPOS
    ? data.payments.map((p) => p.mode_of_payment).filter(Boolean)
    : [];

  // Resolve payment gateway: POS uses payments[] array; non-POS uses custom_payment_type (falls back to payment_type)
  // Filter out ERPNext's literal "None" default value
  const cleanPaymentType = (data.custom_payment_type?.trim() || data.payment_type?.trim()) ?? "";
  const resolvedPaymentMethods =
    posPaymentMethods.length > 0
      ? posPaymentMethods
      : (cleanPaymentType && cleanPaymentType.toLowerCase() !== "none")
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
      fulfillmentStage: isPOS ? "delivery_complete" : "order_received",
      customerEmail,
      customerPhone,
      shippingAddress: shippingAddressObj,
      rawPayload: rawPayload as object,
      ...(resolvedPaymentMethods.length > 0 ? {
        paymentGatewayNames: resolvedPaymentMethods,
        paymentGatewayPrimary: resolvedPaymentMethods[0],
      } : {}),
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
      ...(resolvedPaymentMethods.length > 0 ? {
        paymentGatewayNames: resolvedPaymentMethods,
        paymentGatewayPrimary: resolvedPaymentMethods[0],
      } : {}),
    },
    select: { id: true, name: true },
  });

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
          where: { companyId_name: { companyId: location.companyId, name: "Uncategorized" } },
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

  console.log(`[ERPNext webhook] Upserted vault os order ${order.name} (${financialStatus}) from ERPNext invoice ${data.name}`);
  return NextResponse.json({ ok: true, orderId: order.id, orderName: order.name, financialStatus });
}
