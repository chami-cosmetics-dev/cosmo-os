import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── address helpers ──────────────────────────────────────────────────────────

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

function parseErpAddressHtml(html: string | null | undefined, customerName: string): object | null {
  if (!html?.trim()) return null;
  const lines = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const addrLines =
    lines[0]?.toLowerCase() === customerName.toLowerCase() ? lines.slice(1) : lines;
  if (addrLines.length === 0) return null;
  return {
    name: customerName,
    address1: addrLines[0] ?? null,
    address2: addrLines.length > 2 ? addrLines[1] : null,
    city: addrLines.length > 1 ? addrLines[addrLines.length - 2] : null,
    country: addrLines.length > 1 ? addrLines[addrLines.length - 1] : null,
  };
}

function resolvePaymentType(
  paymentGatewayPrimary: string | null,
  paymentGatewayNames: string[],
  instance: {
    cashMop: string | null; codMop: string | null; cardDeliveryMop: string | null;
    bankTransferMop: string | null; kokoMop: string | null; webxpayMop: string | null;
  } | null,
): string | null {
  const gateways = paymentGatewayNames.length > 0 ? paymentGatewayNames : paymentGatewayPrimary ? [paymentGatewayPrimary] : [];
  const cashMop = instance?.cashMop ?? process.env.ERPNEXT_CASH_MOP ?? "Cash";
  const codMop = instance?.codMop ?? process.env.ERPNEXT_COD_MOP ?? "Cash On Delivery";
  const cardMop = instance?.cardDeliveryMop ?? process.env.ERPNEXT_CARD_DELIVERY_MOP ?? "Credit Card";
  const bankMop = instance?.bankTransferMop ?? process.env.ERPNEXT_BANK_TRANSFER_MOP ?? "Wire Transfer";
  const kokoMop = instance?.kokoMop ?? process.env.ERPNEXT_KOKO_MOP ?? "Koko";
  const webxMop = instance?.webxpayMop ?? process.env.ERPNEXT_WEBXPAY_MOP ?? "";

  for (const g of gateways) {
    const lower = g.toLowerCase().trim();
    if (lower.includes("koko")) return kokoMop;
    if (lower.includes("webxpay")) return webxMop || null;
    if (lower.includes("credit card") || lower.includes("card delivery")) return cardMop;
    if (lower.includes("bank transfer") || lower.includes("wire")) return bankMop;
    if (lower.includes("cash on delivery") || lower === "cod") return codMop;
    if (lower.includes("cash")) return cashMop;
  }
  return gateways[0] ?? null;
}

// ── ERP API helpers ──────────────────────────────────────────────────────────

function erpAuth(apiKey: string, apiSecret: string) {
  return `token ${apiKey}:${apiSecret}`;
}

async function erpGet<T>(baseUrl: string, apiKey: string, apiSecret: string, path: string): Promise<T | null> {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: erpAuth(apiKey, apiSecret) } });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: T };
  return json.data ?? null;
}

async function fetchErpInvoice(
  baseUrl: string, apiKey: string, apiSecret: string, invoiceName: string,
): Promise<{ address_display?: string | null; shipping_address?: string | null; customer?: string; custom_payment_type?: string | null } | null> {
  const fields = encodeURIComponent(JSON.stringify(["address_display", "shipping_address", "customer", "custom_payment_type"]));
  return erpGet(baseUrl, apiKey, apiSecret, `/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}?fields=${fields}`);
}

async function frappe_set_value(
  baseUrl: string, apiKey: string, apiSecret: string,
  doctype: string, name: string, fields: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const form = new URLSearchParams({
    doctype,
    name,
    fieldname: JSON.stringify(fields),
    value: "",
  });
  const res = await fetch(`${baseUrl}/api/method/frappe.client.set_value`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: erpAuth(apiKey, apiSecret) },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

async function ensureErpAddress(
  baseUrl: string, apiKey: string, apiSecret: string,
  customerName: string, addr: ShopifyAddress, addrType: "Billing" | "Shipping",
): Promise<string | null> {
  if (!addr) return null;
  const address1 = addr.address1?.trim() ?? null;
  const city = addr.city?.trim() ?? null;
  if (!address1 && !city) return null;

  try {
    const filter = encodeURIComponent(JSON.stringify([
      ["links.link_doctype", "=", "Customer"],
      ["links.link_name", "=", customerName],
      ["address_type", "=", addrType],
    ]));
    const fields = encodeURIComponent(JSON.stringify(["name"]));
    const existing = await erpGet<Array<{ name: string }>>(baseUrl, apiKey, apiSecret, `/api/resource/Address?filters=${filter}&fields=${fields}&limit=1`);
    if (existing && existing.length > 0) return existing[0].name;

    const res = await fetch(`${baseUrl}/api/resource/Address`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: erpAuth(apiKey, apiSecret) },
      body: JSON.stringify({
        doctype: "Address",
        address_title: `${customerName}-${addrType}`,
        address_type: addrType,
        address_line1: address1 ?? "N/A",
        address_line2: addr.address2?.trim() || null,
        city: city ?? "N/A",
        state: addr.province?.trim() || null,
        country: addr.country?.trim() || "Sri Lanka",
        pincode: addr.zip?.trim() || null,
        phone: addr.phone?.trim() || null,
        is_primary_address: addrType === "Billing" ? 1 : 0,
        is_shipping_address: addrType === "Shipping" ? 1 : 0,
        links: [{ link_doctype: "Customer", link_name: customerName }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { name: string } };
    return json.data?.name ?? null;
  } catch {
    return null;
  }
}

async function ensureCustomerNameUpdated(
  baseUrl: string, apiKey: string, apiSecret: string,
  phone: string | null, incomingName: string,
): Promise<void> {
  if (!phone) return;
  try {
    const variants = buildPhoneLookupVariants(phone.trim()).slice(0, 20).map((v) => v.slice(0, 20));
    if (variants.length === 0) return;
    const filter = encodeURIComponent(JSON.stringify([["mobile_no", "in", variants]]));
    const fields = encodeURIComponent(JSON.stringify(["name", "customer_name"]));
    const found = await erpGet<Array<{ name: string; customer_name: string }>>(
      baseUrl, apiKey, apiSecret,
      `/api/resource/Customer?filters=${filter}&fields=${fields}&limit=1`,
    );
    if (!found || found.length === 0) return;
    const existing = found[0];
    if (existing.customer_name === incomingName) return;
    await frappe_set_value(baseUrl, apiKey, apiSecret, "Customer", existing.name, { customer_name: incomingName });
  } catch {
    // best-effort
  }
}

// ── route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["orders.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const dryRun = searchParams.get("dry_run") === "1";
  const mode = searchParams.get("mode") === "erp" ? "erp" : "shopify";

  const eligibleWhere = {
    companyId,
    erpnextInvoiceId: { not: null as string | null },
    sourceName: { in: mode === "erp" ? ["erpnext"] : ["web", "manual"] },
  };

  const orders = await prisma.order.findMany({
    where: eligibleWhere,
    select: {
      id: true,
      name: true,
      shopifyOrderId: true,
      erpnextInvoiceId: true,
      rawPayload: true,
      companyLocationId: true,
      customerPhone: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  const totalEligible = await prisma.order.count({ where: eligibleWhere });

  const locationIds = [...new Set(orders.map((o) => o.companyLocationId))];
  const locations = await prisma.companyLocation.findMany({
    where: { id: { in: locationIds } },
    select: {
      id: true,
      erpnextInstance: {
        select: {
          baseUrl: true, apiKey: true, apiSecret: true,
          cashMop: true, codMop: true, cardDeliveryMop: true,
          bankTransferMop: true, kokoMop: true, webxpayMop: true,
        },
      },
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
    const instance = locationMap.get(order.companyLocationId)?.erpnextInstance ?? null;
    const baseUrl = (instance?.baseUrl ?? baseUrlEnv).replace(/\/$/, "");
    const apiKey = instance?.apiKey ?? apiKeyEnv;
    const apiSecret = instance?.apiSecret ?? apiSecretEnv;

    if (!baseUrl || !apiKey || !apiSecret) {
      results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "skipped", detail: "No ERP credentials" });
      continue;
    }

    if (mode === "erp") {
      // ── ERP mode: fetch address from ERP, store in Vault OS shippingAddress ──
      if (dryRun) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "dry_run", detail: "Would fetch address from ERP and update Vault OS shippingAddress" });
        continue;
      }

      const erpData = await fetchErpInvoice(baseUrl, apiKey, apiSecret, invoiceId);
      if (!erpData) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "skipped", detail: "Invoice not found in ERP (deleted or renamed)" });
        continue;
      }

      const customerName = erpData.customer ?? order.name ?? invoiceId;
      const parsed = parseErpAddressHtml(erpData.shipping_address ?? erpData.address_display, customerName);
      if (!parsed) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "skipped", detail: "No address on ERP invoice" });
        continue;
      }

      await prisma.order.update({ where: { id: order.id }, data: { shippingAddress: parsed } });
      results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "updated" });

    } else {
      // ── Shopify mode: patch ERP invoice with address + payment_type ──
      const payload = order.rawPayload as Record<string, unknown> | null;
      const rawBilling = payload?.billing_address as ShopifyAddress;
      const rawShipping = payload?.shipping_address as ShopifyAddress;
      const billingAddr = rawBilling ?? rawShipping;
      const shippingAddr = rawShipping ?? rawBilling;

      const paymentType = resolvePaymentType(
        order.paymentGatewayPrimary,
        order.paymentGatewayNames as string[],
        instance,
      );

      const hasAddress = !!(billingAddr || shippingAddr);
      const hasPayment = !!paymentType;

      if (!hasAddress && !hasPayment) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "skipped", detail: "No address or payment type to backfill" });
        continue;
      }

      if (dryRun) {
        results.push({
          orderId: order.id,
          orderName: order.name,
          invoiceId,
          status: "dry_run",
          detail: `Would patch: payment_type="${paymentType ?? "—"}", billing="${formatAddressHtml(billingAddr)?.slice(0, 40) ?? "—"}"`,
        });
        continue;
      }

      // Fetch current ERP invoice to check what's already set
      const erpData = await fetchErpInvoice(baseUrl, apiKey, apiSecret, invoiceId);
      if (!erpData) {
        // 404 = invoice deleted/cancelled in ERP — nothing to patch, skip cleanly
        results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "skipped", detail: "Invoice not found in ERP (deleted or renamed)" });
        continue;
      }

      const customerName = erpData.customer ?? "";
      const patched: string[] = [];
      const failed: string[] = [];

      // Update customer display name if phone-matched customer differs
      if (customerName && order.customerPhone) {
        await ensureCustomerNameUpdated(baseUrl, apiKey, apiSecret, order.customerPhone, customerName);
      }

      // Create Address documents linked to the customer (best-effort, for future invoices)
      if (customerName) {
        void Promise.all([
          billingAddr ? ensureErpAddress(baseUrl, apiKey, apiSecret, customerName, billingAddr, "Billing") : Promise.resolve(null),
          shippingAddr ? ensureErpAddress(baseUrl, apiKey, apiSecret, customerName, shippingAddr, "Shipping") : Promise.resolve(null),
        ]);
      }

      // Only patch custom_payment_type — standard address fields (address_display, shipping_address)
      // cannot have "Allow on Submit" enabled in ERPNext and will always fail on submitted invoices.
      if (paymentType && !erpData.custom_payment_type) {
        const r = await frappe_set_value(baseUrl, apiKey, apiSecret, "Sales Invoice", invoiceId, { custom_payment_type: paymentType });
        if (r.ok) patched.push("custom_payment_type"); else failed.push(`custom_payment_type(${r.error?.slice(0, 60)})`);
      }

      if (patched.length === 0 && failed.length === 0) {
        results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "skipped", detail: "Already complete in ERP" });
        continue;
      }

      results.push({
        orderId: order.id,
        orderName: order.name,
        invoiceId,
        status: patched.length > 0 ? "updated" : "error",
        detail: [
          patched.length > 0 ? `patched: ${patched.join(", ")}` : null,
          failed.length > 0 ? `blocked: ${failed.join(", ")}` : null,
        ].filter(Boolean).join(" | "),
      });
    }
  }

  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  const dryRunCount = results.filter((r) => r.status === "dry_run").length;

  return NextResponse.json({
    mode,
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
