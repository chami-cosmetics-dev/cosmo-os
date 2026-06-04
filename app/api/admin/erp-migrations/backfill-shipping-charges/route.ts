import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── ERP API helpers ───────────────────────────────────────────────────────────

function erpHeaders(apiKey: string, apiSecret: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${apiKey}:${apiSecret}`,
  };
}

async function erpGet<T>(base: string, key: string, secret: string, path: string): Promise<T | null> {
  const res = await fetch(`${base}${path}`, { headers: erpHeaders(key, secret) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: T };
  return json.data ?? null;
}

async function erpMethod<T>(base: string, key: string, secret: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}/api/method/${method}`, {
    method: "POST",
    headers: erpHeaders(key, secret),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST method/${method} [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { message?: T };
  return json.message as T;
}

async function erpPatch(base: string, key: string, secret: string, name: string, body: unknown): Promise<void> {
  const encoded = encodeURIComponent(name);
  const res = await fetch(`${base}/api/resource/Sales%20Invoice/${encoded}`, {
    method: "PUT",
    headers: erpHeaders(key, secret),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT Sales Invoice/${name} [${res.status}]: ${(await res.text()).slice(0, 300)}`);
}

// ── Backfill ──────────────────────────────────────────────────────────────────

type InvoiceDoc = {
  name: string;
  docstatus: number;
  grand_total: number;
  outstanding_amount: number;
  taxes: Array<{ charge_type?: string; account_head?: string; description?: string; tax_amount?: number }>;
};

type OrderRow = {
  id: string;
  name: string | null;
  erpnextInvoiceId: string | null;
  totalShipping: string | number | null;
  companyLocation: {
    erpnextInstance: {
      baseUrl: string;
      apiKey: string;
      apiSecret: string;
      shippingChargeAccount: string | null;
    } | null;
  } | null;
};

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = body.dryRun !== false; // default to dry-run for safety

  // Find orders: Shopify-sourced, already synced to ERP, have shipping, have rawPayload
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      totalShipping: { gt: 0 },
      erpnextInvoiceId: { not: null },
      sourceName: { in: ["web", "manual"] },
      financialStatus: { not: "voided" },
    },
    select: {
      id: true,
      name: true,
      erpnextInvoiceId: true,
      totalShipping: true,
      companyLocation: {
        select: {
          erpnextInstance: {
            select: {
              baseUrl: true,
              apiKey: true,
              apiSecret: true,
              shippingChargeAccount: true,
            },
          },
        },
      },
    },
  }) as OrderRow[];

  type ResultRow = {
    orderId: string;
    orderName: string | null;
    invoiceId: string;
    shippingAmount: number;
    status: "fixed" | "skipped" | "dry_run" | "error";
    reason?: string;
    newInvoiceId?: string;
  };

  const results: ResultRow[] = [];

  for (const order of orders) {
    const invoiceId = order.erpnextInvoiceId!;
    const shippingAmt = parseFloat(String(order.totalShipping ?? 0));
    const inst = order.companyLocation?.erpnextInstance;

    if (!inst?.baseUrl || !inst.apiKey || !inst.apiSecret) {
      results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "skipped", reason: "No ERP instance configured" });
      continue;
    }

    if (!inst.shippingChargeAccount) {
      results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "skipped", reason: "No Shipping Charge Account configured on ERP instance" });
      continue;
    }

    const base = inst.baseUrl.replace(/\/$/, "");
    const { apiKey, apiSecret, shippingChargeAccount } = inst;

    try {
      // Fetch invoice from ERP
      const fields = encodeURIComponent(JSON.stringify(["name", "docstatus", "grand_total", "outstanding_amount", "taxes"]));
      const invoice = await erpGet<InvoiceDoc>(base, apiKey, apiSecret, `/api/resource/Sales%20Invoice/${encodeURIComponent(invoiceId)}?fields=${fields}`);

      if (!invoice) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "skipped", reason: "Invoice not found in ERP" });
        continue;
      }

      if (invoice.docstatus !== 1) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "skipped", reason: `Invoice docstatus=${invoice.docstatus} (not submitted)` });
        continue;
      }

      // Check if shipping already exists in taxes
      const hasShipping = (invoice.taxes ?? []).some(
        (t) => t.account_head === shippingChargeAccount || (t.description?.toLowerCase().includes("shipping") && (t.tax_amount ?? 0) > 0)
      );
      if (hasShipping) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "skipped", reason: "Shipping charge already present in invoice" });
        continue;
      }

      // Check if payments have been recorded (outstanding < grand_total means partial/full payment)
      const tolerance = 0.01;
      if (invoice.outstanding_amount < invoice.grand_total - tolerance) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "skipped", reason: `Invoice has recorded payments (outstanding=${invoice.outstanding_amount}) — fix manually in ERP` });
        continue;
      }

      if (dryRun) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "dry_run", reason: "Would add shipping charge and re-submit" });
        continue;
      }

      // 1. Cancel original invoice
      await erpMethod(base, apiKey, apiSecret, "frappe.client.cancel", { doctype: "Sales Invoice", name: invoiceId });

      // 2. Amend — creates a draft copy
      const amendment = await erpMethod<{ name: string; taxes: InvoiceDoc["taxes"] }>(
        base, apiKey, apiSecret, "frappe.client.amend_document", { doctype: "Sales Invoice", name: invoiceId }
      );
      const amendmentName = amendment.name;

      // 3. Add shipping taxes row to the amendment
      const updatedTaxes = [
        ...(amendment.taxes ?? []),
        {
          charge_type: "Actual",
          account_head: shippingChargeAccount,
          description: "Shipping Fee",
          tax_amount: shippingAmt,
        },
      ];
      await erpPatch(base, apiKey, apiSecret, amendmentName, { taxes: updatedTaxes });

      // 4. Submit the amendment
      await erpMethod(base, apiKey, apiSecret, "frappe.client.submit", { doc: { doctype: "Sales Invoice", name: amendmentName } });

      // 5. Update order in DB
      await prisma.order.update({
        where: { id: order.id },
        data: { erpnextInvoiceId: amendmentName },
      });

      results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "fixed", newInvoiceId: amendmentName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ orderId: order.id, orderName: order.name, invoiceId, shippingAmount: shippingAmt, status: "error", reason: msg.slice(0, 300) });
    }
  }

  const summary = {
    total: results.length,
    fixed: results.filter((r) => r.status === "fixed").length,
    dryRun: results.filter((r) => r.status === "dry_run").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  return NextResponse.json({ dryRun, summary, results });
}
