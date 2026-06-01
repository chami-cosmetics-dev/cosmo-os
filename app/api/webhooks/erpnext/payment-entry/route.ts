import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { erpnextPaymentEntryWebhookSchema } from "@/lib/validation/erpnext-payment-entry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function resolveInstanceSecret(company: string): Promise<string> {
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: company },
    select: {
      erpnextInstance: { select: { incomingWebhookSecret: true } },
    },
  });
  return (
    location?.erpnextInstance?.incomingWebhookSecret ??
    process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ??
    ""
  );
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

  const secret = await resolveInstanceSecret(company);
  if (!secret || incomingSecret !== secret) {
    console.error("[ERPNext payment webhook] Invalid or missing secret for company:", company);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextPaymentEntryWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    console.error("[ERPNext payment webhook] Validation failed", parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const salesInvoiceRefs = data.references.filter(
    (ref) => ref.reference_doctype === "Sales Invoice",
  );

  if (salesInvoiceRefs.length === 0) {
    console.log(`[ERPNext payment webhook] Payment ${data.name} has no Sales Invoice references — skipping`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const updated: string[] = [];

  for (const ref of salesInvoiceRefs) {
    const erpInvoiceId = `erp-${ref.reference_name}`;
    const order = await prisma.order.findUnique({
      where: { shopifyOrderId: erpInvoiceId },
      select: { id: true, name: true },
    });

    if (!order) {
      console.log(`[ERPNext payment webhook] No vault os order for invoice ${ref.reference_name} — skipping`);
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { financialStatus: "paid" },
    });

    console.log(`[ERPNext payment webhook] Order ${order.name} marked as paid via Payment Entry ${data.name}`);
    updated.push(order.name ?? ref.reference_name);
  }

  return NextResponse.json({ ok: true, updated });
}
