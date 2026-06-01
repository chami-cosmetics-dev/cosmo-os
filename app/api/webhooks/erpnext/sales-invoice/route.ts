import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
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
  const unwrapped: Record<string, unknown> =
    topLevel?.data !== null &&
    typeof topLevel?.data === "object" &&
    !Array.isArray(topLevel?.data)
      ? (topLevel.data as Record<string, unknown>)
      : topLevel;

  const companyRaw = unwrapped?.company;
  const company = typeof companyRaw === "string" ? companyRaw : "";

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
  let financialStatus: string;
  if (data.docstatus === 2) {
    financialStatus = "voided";
  } else if (isPOS) {
    // POS: PE is created at same time as SI submission — check outstanding_amount directly
    const freshOutstanding = await fetchOutstandingAmount(
      data.name,
      instanceCreds.baseUrl,
      instanceCreds.apiKey,
      instanceCreds.apiSecret,
    );
    financialStatus = freshOutstanding !== null && freshOutstanding <= 0 ? "paid" : "pending";
  } else {
    // Non-POS ERP invoice: always pending on submit — PE webhook will mark it paid later
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
        select: { id: true, companyId: true, defaultMerchantUserId: true },
      });
      if (byWarehouse) return byWarehouse;
    }
    return prisma.companyLocation.findFirst({
      where: { erpnextCompany: data.company },
      select: { id: true, companyId: true, defaultMerchantUserId: true },
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
      shippingAddress: { name: data.customer },
      rawPayload: rawPayload as object,
      ...(assignedMerchantId ? { assignedMerchantId } : {}),
    },
    update: {
      totalPrice: grandTotal,
      financialStatus,
      erpnextInvoiceId: data.name,
      customerEmail,
      customerPhone,
      shippingAddress: { name: data.customer },
      rawPayload: rawPayload as object,
    },
    select: { id: true, name: true },
  });

  // Rebuild line items on every save
  if (data.items.length > 0) {
    await prisma.orderLineItem.deleteMany({ where: { orderId: order.id } });

    for (const [idx, item] of data.items.entries()) {
      if (!item.item_code) continue;

      const productItem = await prisma.productItem.findFirst({
        where: { companyLocationId: location.id, sku: item.item_code },
        select: { id: true },
      });
      if (!productItem) continue;

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
