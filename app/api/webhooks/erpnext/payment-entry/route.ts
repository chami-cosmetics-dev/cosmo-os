import { NextRequest, NextResponse } from "next/server";

import {
  groupSalesInvoiceAllocations,
  isPaymentEntryDirection,
  resolveOrderPaymentFinancialStatus,
  signedPaymentAmount,
  summarizeOrderPayments,
} from "@/lib/order-payment-entries";
import { prisma } from "@/lib/prisma";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { erpnextPaymentEntryWebhookSchema } from "@/lib/validation/erpnext-payment-entry";

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

async function fetchPurchaseInvoiceOutstanding(invoiceName: string, creds: { baseUrl: string; apiKey: string; apiSecret: string }): Promise<number | null> {
  try {
    const fields = encodeURIComponent(JSON.stringify(["outstanding_amount", "docstatus"]));
    const res = await fetch(`${creds.baseUrl}/api/resource/Purchase%20Invoice/${encodeURIComponent(invoiceName)}?fields=${fields}`, {
      headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: { outstanding_amount?: number; docstatus?: number } };
    return json.data?.docstatus === 1 && Number.isFinite(Number(json.data.outstanding_amount))
      ? Number(json.data.outstanding_amount) : null;
  } catch { return null; }
}

async function recordCosmoGrnPayments(data: { name: string; company: string; payment_type?: string | null; party_type?: string | null; references: Array<{ reference_doctype: string; reference_name: string; allocated_amount?: number | null }>; posting_date?: string | null }, creds: { baseUrl: string; apiKey: string; apiSecret: string }) {
  if (isVaultOsDeployment() || data.payment_type !== "Pay" || data.party_type !== "Supplier") return;
  const location = await prisma.companyLocation.findFirst({ where: { erpnextCompany: data.company }, select: { companyId: true } });
  if (!location) return;
  const invoiceNames = [...new Set(data.references.filter((ref) => ref.reference_doctype === "Purchase Invoice" && Number(ref.allocated_amount) > 0).map((ref) => ref.reference_name))];
  if (!invoiceNames.length) return;
  const [live, backfill] = await Promise.all([
    prisma.grnPurchaseInvoice.findMany({ where: { companyId: location.companyId, name: { in: invoiceNames }, deletedAt: null, docstatus: 1, isReturn: { not: 1 }, purchaseReceiptName: { not: null } }, select: { purchaseReceiptName: true } }),
    prisma.grnBackfillPurchaseInvoice.findMany({ where: { companyId: location.companyId, name: { in: invoiceNames }, deletedAt: null, docstatus: 1, isReturn: { not: 1 }, purchaseReceiptName: { not: null } }, select: { purchaseReceiptName: true } }),
  ]);
  const receiptNames = [...new Set([...live, ...backfill].map((pi) => pi.purchaseReceiptName).filter((name): name is string => Boolean(name)))];
  for (const receiptName of receiptNames) {
    for (const isBackfill of [false, true]) {
      const receipt = isBackfill
        ? await prisma.grnBackfillPurchaseReceipt.findFirst({ where: { companyId: location.companyId, name: receiptName, deletedAt: null, docstatus: { not: 2 }, receivedAt: { not: null } }, select: { name: true } })
        : await prisma.grnPurchaseReceipt.findFirst({ where: { companyId: location.companyId, name: receiptName, deletedAt: null, docstatus: { not: 2 }, receivedAt: { not: null } }, select: { name: true } });
      if (!receipt) continue;
      const [liveInvoices, backfillInvoices] = await Promise.all([
        prisma.grnPurchaseInvoice.findMany({ where: { companyId: location.companyId, purchaseReceiptName: receiptName, deletedAt: null, docstatus: 1, isReturn: { not: 1 } }, select: { name: true } }),
        prisma.grnBackfillPurchaseInvoice.findMany({ where: { companyId: location.companyId, purchaseReceiptName: receiptName, deletedAt: null, docstatus: 1, isReturn: { not: 1 } }, select: { name: true } }),
      ]);
      const linked = [...new Set([...liveInvoices, ...backfillInvoices].map((pi) => pi.name))];
      if (!linked.length) continue;
      const balances = await Promise.all(linked.map((name) => fetchPurchaseInvoiceOutstanding(name, creds)));
      if (balances.some((balance) => balance === null || balance > 0.005)) continue;
      const postedAt = data.posting_date ? new Date(`${data.posting_date}T00:00:00.000Z`) : new Date();
      const paidAt = Number.isNaN(postedAt.getTime()) ? new Date() : postedAt;
      await prisma.grnPaymentApproval.upsert({
        where: { companyId_purchaseReceiptName_purchaseReceiptIsBackfill: { companyId: location.companyId, purchaseReceiptName: receiptName, purchaseReceiptIsBackfill: isBackfill } },
        create: { companyId: location.companyId, purchaseReceiptName: receiptName, purchaseReceiptIsBackfill: isBackfill, approvedAt: null, paidAt, paymentEntryName: data.name },
        update: { paidAt, paymentEntryName: data.name },
      });
    }
  }
}

async function fetchPaymentEntry(
  paymentEntryId: string,
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
): Promise<unknown | null> {
  try {
    const res = await fetch(
      `${baseUrl}/api/resource/Payment Entry/${encodeURIComponent(paymentEntryId)}`,
      { headers: { Authorization: `token ${apiKey}:${apiSecret}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    return json.data ?? null;
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

  let data = parsed.data;

  // Only process submitted Payment Entries
  if (data.docstatus !== 1) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Internal transfers do not represent customer invoice payments.
  if (!isPaymentEntryDirection(data.payment_type)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // HOOK-0004 currently includes references but omits posting_date. Fetch the
  // authoritative document whenever the configured payload is incomplete.
  if (
    !data.posting_date ||
    !data.mode_of_payment ||
    data.paid_amount == null ||
    data.references.length === 0
  ) {
    const fullDocument = await fetchPaymentEntry(
      data.name,
      creds.baseUrl,
      creds.apiKey,
      creds.apiSecret,
    );
    const fullParsed = erpnextPaymentEntryWebhookSchema.safeParse(fullDocument);
    if (!fullParsed.success) {
      console.error(
        `[ERPNext PE webhook] Could not fetch complete Payment Entry ${data.name}`,
        fullParsed.error.flatten(),
      );
      return NextResponse.json(
        { error: "Could not fetch complete Payment Entry" },
        { status: 502 },
      );
    }
    data = fullParsed.data;
  }

  if (!isPaymentEntryDirection(data.payment_type)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await recordCosmoGrnPayments(data, creds);
  const allocations = groupSalesInvoiceAllocations(data.references);
  if (allocations.length === 0) {
    console.log(`[ERPNext PE webhook] ${data.name} has no Sales Invoice references — skipping`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!data.posting_date || !data.mode_of_payment || data.paid_amount == null) {
    console.error(`[ERPNext PE webhook] ${data.name} is missing required payment fields`);
    return NextResponse.json({ error: "Incomplete Payment Entry" }, { status: 502 });
  }

  const postingDate = new Date(`${data.posting_date}T00:00:00.000Z`);
  if (Number.isNaN(postingDate.getTime())) {
    return NextResponse.json({ error: "Invalid posting_date" }, { status: 400 });
  }

  const updated: string[] = [];
  const signedAmount = signedPaymentAmount(data.paid_amount, data.payment_type);

  for (const allocation of allocations) {
    const invoiceName = allocation.invoiceName;
    // Find Vault OS order — ERP-originated orders use erp-{invoiceName} as shopifyOrderId
    // Shopify-originated orders that got synced to ERP use erpnextInvoiceId
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { shopifyOrderId: `erp-${invoiceName}` },
          { erpnextInvoiceId: invoiceName, sourceName: { not: "erpnext" } },
        ],
      },
      select: { id: true, name: true, financialStatus: true, totalPrice: true },
    });

    if (!order) {
      console.log(`[ERPNext PE webhook] No Vault OS order for invoice ${invoiceName} — skipping`);
      continue;
    }

    const signedAllocation = signedPaymentAmount(
      allocation.allocatedAmount,
      data.payment_type,
    );

    await prisma.orderPaymentEntry.upsert({
      where: {
        orderId_paymentEntryId: {
          orderId: order.id,
          paymentEntryId: data.name,
        },
      },
      create: {
        orderId: order.id,
        paymentEntryId: data.name,
        paymentType: data.payment_type,
        modeOfPayment: data.mode_of_payment,
        amount: signedAmount,
        allocatedAmount: signedAllocation,
        postingDate,
      },
      update: {
        paymentType: data.payment_type,
        modeOfPayment: data.mode_of_payment,
        amount: signedAmount,
        allocatedAmount: signedAllocation,
        postingDate,
      },
    });

    const [storedPayments, outstanding] = await Promise.all([
      prisma.orderPaymentEntry.findMany({
        where: { orderId: order.id },
        select: { paymentType: true, allocatedAmount: true },
      }),
      fetchOutstandingAmount(
        invoiceName,
        creds.baseUrl,
        creds.apiKey,
        creds.apiSecret,
      ),
    ]);
    const invoiceTotal = Number(order.totalPrice);
    const summary = summarizeOrderPayments(storedPayments, invoiceTotal);
    const financialStatus = resolveOrderPaymentFinancialStatus({
      currentStatus: order.financialStatus,
      outstandingAmount: outstanding,
      incomingPaid: summary.incomingPaid,
      netPaid: summary.netPaid,
      invoiceTotal,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { financialStatus },
    });

    console.log(
      `[ERPNext PE webhook] Order ${order.name} recorded ${data.payment_type} ${data.name} (${financialStatus})`,
    );
    updated.push(order.name ?? invoiceName);
  }

  return NextResponse.json({ ok: true, updated });
}
