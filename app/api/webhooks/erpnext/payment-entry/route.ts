import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { erpnextPaymentEntryWebhookSchema } from "@/lib/validation/erpnext-payment-entry";
import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function resolveInstanceCreds(company: string): Promise<{
  secret: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
} | null> {
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

async function fetchOutstandingAmount(
  invoiceName: string,
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
): Promise<number | null> {
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

  const company = typeof unwrapped?.company === "string" ? unwrapped.company : "";

  const creds = await resolveInstanceCreds(company);
  if (!creds || !creds.secret || incomingSecret !== creds.secret) {
    console.error("[ERPNext PE webhook] Invalid or missing secret for company:", company);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextPaymentEntryWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    console.error("[ERPNext PE webhook] Validation failed", parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Only process submitted Payment Entries
  if (data.docstatus !== 1) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Only process incoming payments (Receive = customer paying us)
  if (data.payment_type && data.payment_type !== "Receive") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const siRefs = data.references.filter((r) => r.reference_doctype === "Sales Invoice");
  if (siRefs.length === 0) {
    console.log(`[ERPNext PE webhook] ${data.name} has no Sales Invoice references — skipping`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const updated: string[] = [];

  for (const ref of siRefs) {
    const invoiceName = ref.reference_name;

    // Find Vault OS order — ERP-originated orders use erp-{invoiceName} as shopifyOrderId
    // Shopify-originated orders that got synced to ERP use erpnextInvoiceId
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { shopifyOrderId: `erp-${invoiceName}` },
          { erpnextInvoiceId: invoiceName, sourceName: { not: "erpnext" } },
        ],
      },
      select: { id: true, name: true, financialStatus: true },
    });

    if (!order) {
      console.log(`[ERPNext PE webhook] No Vault OS order for invoice ${invoiceName} — skipping`);
      continue;
    }

    if (order.financialStatus === "paid" || order.financialStatus === "voided") {
      console.log(`[ERPNext PE webhook] Order ${order.name} already ${order.financialStatus} — skipping`);
      continue;
    }

    // Verify outstanding_amount is actually cleared in ERP before marking paid
    const outstanding = await fetchOutstandingAmount(invoiceName, creds.baseUrl, creds.apiKey, creds.apiSecret);
    if (outstanding === null || outstanding > 0) {
      console.log(`[ERPNext PE webhook] Invoice ${invoiceName} still has outstanding ${outstanding} — skipping`);
      continue;
    }

    const now = new Date();
    await prisma.order.update({
      where: { id: order.id },
      data: { financialStatus: "paid" },
    });

    // Auto-resolve any pending finance approval — payment confirmed by ERPNext
    await prisma.$executeRaw`
      UPDATE "ApprovalRequest"
      SET "status" = 'approved', "reviewNote" = 'Auto-approved: payment confirmed by ERPNext', "reviewedAt" = ${now}, "updatedAt" = ${now}
      WHERE "orderId" = ${order.id}
        AND "type" = ${ORDER_PAYMENT_APPROVAL}
        AND "status" = 'pending'
    `;

    console.log(`[ERPNext PE webhook] Order ${order.name} marked paid via Payment Entry ${data.name}`);
    updated.push(order.name ?? invoiceName);
  }

  return NextResponse.json({ ok: true, updated });
}
