import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ShopifyAddress = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
} | null | undefined;

function formatAddressHtml(addr: ShopifyAddress): string | null {
  if (!addr) return null;
  const fullName =
    addr.name?.trim() ||
    [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim();
  const lines: string[] = [];
  if (fullName) lines.push(fullName);
  if (addr.address1) lines.push(addr.address1);
  if (addr.address2) lines.push(addr.address2);
  const cityLine = [addr.city, addr.province, addr.zip].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (addr.country) lines.push(addr.country);
  if (addr.phone) lines.push(addr.phone);
  return lines.length > 0 ? lines.join("<br>") : null;
}

async function setErpInvoiceAddress(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  invoiceName: string,
  addressDisplay: string | null,
  shippingAddress: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const authHeader = `token ${apiKey}:${apiSecret}`;

  // Update both fields via frappe.client.set_value (works on submitted docs)
  const updates: Record<string, string> = {};
  if (addressDisplay) updates.address_display = addressDisplay;
  if (shippingAddress) updates.shipping_address = shippingAddress;

  if (Object.keys(updates).length === 0) return { ok: true };

  // frappe.client.set_value accepts fieldname as a JSON-encoded dict for multi-field updates
  const formBody = new URLSearchParams({
    doctype: "Sales Invoice",
    name: invoiceName,
    fieldname: JSON.stringify(updates),
    value: "",
  });

  const res = await fetch(`${baseUrl}/api/method/frappe.client.set_value`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: authHeader,
    },
    body: formBody.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
  }

  return { ok: true };
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["orders.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const dryRun = searchParams.get("dry_run") === "1";

  const eligibleWhere = {
    companyId,
    erpnextInvoiceId: { not: null as string | null },
    sourceName: { in: ["web", "manual"] },
  };

  // Only Shopify-originated orders that have been synced to ERP
  const orders = await prisma.order.findMany({
    where: eligibleWhere,
    select: {
      id: true,
      name: true,
      shopifyOrderId: true,
      erpnextInvoiceId: true,
      rawPayload: true,
      companyLocationId: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  const totalEligible = await prisma.order.count({ where: eligibleWhere });

  // Fetch ERP instance credentials per unique location
  const locationIds = [...new Set(orders.map((o) => o.companyLocationId))];
  const locations = await prisma.companyLocation.findMany({
    where: { id: { in: locationIds } },
    select: {
      id: true,
      erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } },
    },
  });
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  const results: Array<{
    orderId: string;
    orderName: string | null;
    invoiceId: string;
    status: "updated" | "skipped" | "error" | "dry_run";
    detail?: string;
  }> = [];

  const baseUrlEnv = (process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
  const apiKeyEnv = process.env.ERPNEXT_API_KEY ?? "";
  const apiSecretEnv = process.env.ERPNEXT_API_SECRET ?? "";

  for (const order of orders) {
    const invoiceId = order.erpnextInvoiceId!;

    const instance = locationMap.get(order.companyLocationId)?.erpnextInstance;
    const baseUrl = (instance?.baseUrl ?? baseUrlEnv).replace(/\/$/, "");
    const apiKey = instance?.apiKey ?? apiKeyEnv;
    const apiSecret = instance?.apiSecret ?? apiSecretEnv;

    if (!baseUrl || !apiKey || !apiSecret) {
      results.push({
        orderId: order.id,
        orderName: order.name,
        invoiceId,
        status: "skipped",
        detail: "No ERP credentials configured for this location",
      });
      continue;
    }

    const payload = order.rawPayload as Record<string, unknown> | null;
    const billingAddr = payload?.billing_address as ShopifyAddress;
    const shippingAddr = payload?.shipping_address as ShopifyAddress;

    const addressDisplay = formatAddressHtml(billingAddr);
    const shippingAddress = formatAddressHtml(shippingAddr);

    if (!addressDisplay && !shippingAddress) {
      results.push({
        orderId: order.id,
        orderName: order.name,
        invoiceId,
        status: "skipped",
        detail: "No address found in rawPayload",
      });
      continue;
    }

    if (dryRun) {
      results.push({
        orderId: order.id,
        orderName: order.name,
        invoiceId,
        status: "dry_run",
        detail: `Would set: address_display="${addressDisplay?.slice(0, 60)}…" shipping_address="${shippingAddress?.slice(0, 60)}…"`,
      });
      continue;
    }

    const result = await setErpInvoiceAddress(baseUrl, apiKey, apiSecret, invoiceId, addressDisplay, shippingAddress);

    results.push({
      orderId: order.id,
      orderName: order.name,
      invoiceId,
      status: result.ok ? "updated" : "error",
      detail: result.error,
    });
  }

  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  const dryRunCount = results.filter((r) => r.status === "dry_run").length;

  return NextResponse.json({
    dryRun,
    totalEligible,
    processed: orders.length,
    offset,
    limit,
    hasMore: offset + orders.length < totalEligible,
    nextOffset: offset + orders.length,
    summary: { updated, skipped, errors, dryRunCount },
    results,
  });
}
