import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
import { erpnextSalesInvoiceWebhookSchema } from "@/lib/validation/erpnext-sales-invoice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const secret = process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";

  if (!secret || incomingSecret !== secret) {
    console.error("[ERPNext webhook] Invalid or missing secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[ERPNext webhook] Raw payload:", JSON.stringify(rawPayload).slice(0, 500));

  const parsed = erpnextSalesInvoiceWebhookSchema.safeParse(rawPayload);
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
  let financialStatus: string;
  if (data.docstatus === 2) {
    financialStatus = "voided";
  } else if (data.docstatus === 1 && (data.outstanding_amount ?? data.grand_total ?? 1) <= 0) {
    financialStatus = "paid";
  } else {
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

  // Find location by ERPNext company name
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: data.company },
    select: { id: true, companyId: true },
  });
  if (!location) {
    console.error(`[ERPNext webhook] No location found for company "${data.company}"`);
    return NextResponse.json(
      { error: `No vault os location mapped to ERPNext company "${data.company}"` },
      { status: 422 },
    );
  }

  const grandTotal = new Decimal(data.grand_total ?? 0);
  const customerEmail = data.contact_email?.trim() || null;
  const customerPhone = data.contact_mobile?.trim() || null;

  const order = await prisma.order.upsert({
    where: { shopifyOrderId: erpInvoiceId },
    create: {
      companyId: location.companyId,
      companyLocationId: location.id,
      shopifyOrderId: erpInvoiceId,
      sourceName: "erpnext",
      name: data.name,
      totalPrice: grandTotal,
      currency: data.currency ?? "LKR",
      financialStatus,
      customerEmail,
      customerPhone,
      shippingAddress: { name: data.customer },
      rawPayload: rawPayload as object,
    },
    update: {
      totalPrice: grandTotal,
      financialStatus,
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
