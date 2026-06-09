import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchErpMerchantCoupon(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  invoiceName: string,
): Promise<string | null> {
  try {
    const fields = encodeURIComponent(JSON.stringify(["custom_merchant_coupon_code"]));
    const res = await fetch(
      `${baseUrl}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}?fields=${fields}`,
      { headers: { Authorization: `token ${apiKey}:${apiSecret}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { custom_merchant_coupon_code?: string | null } };
    return json.data?.custom_merchant_coupon_code?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["orders.manage"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const dryRun = searchParams.get("dry_run") === "1";

  const eligibleWhere: Prisma.OrderWhereInput = {
    companyId,
    sourceName: { in: ["erpnext", "erpnext-pos"] },
    erpnextInvoiceId: { not: null },
    discountCodes: { equals: Prisma.JsonNull },
  };

  const [orders, totalEligible] = await Promise.all([
    prisma.order.findMany({
      where: eligibleWhere,
      select: { id: true, name: true, erpnextInvoiceId: true, companyLocationId: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.order.count({ where: eligibleWhere }),
  ]);

  const locationIds = [...new Set(orders.map((o) => o.companyLocationId))];
  const locations = await prisma.companyLocation.findMany({
    where: { id: { in: locationIds } },
    select: {
      id: true,
      erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } },
    },
  });
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  const baseUrlEnv = (process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
  const apiKeyEnv = process.env.ERPNEXT_API_KEY ?? "";
  const apiSecretEnv = process.env.ERPNEXT_API_SECRET ?? "";

  const results: Array<{
    orderId: string;
    orderName: string | null;
    invoiceId: string;
    status: "updated" | "skipped" | "no_coupon" | "error" | "dry_run";
    coupon?: string;
    detail?: string;
  }> = [];

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

    if (dryRun) {
      results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "dry_run", detail: "Would fetch custom_merchant_coupon_code from ERP" });
      continue;
    }

    const coupon = await fetchErpMerchantCoupon(baseUrl, apiKey, apiSecret, invoiceId);

    if (!coupon) {
      results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "no_coupon", detail: "Invoice has no merchant coupon code" });
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { discountCodes: [{ code: coupon }] },
    });

    results.push({ orderId: order.id, orderName: order.name, invoiceId, status: "updated", coupon });
  }

  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const noCoupon = results.filter((r) => r.status === "no_coupon").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    dryRun,
    totalEligible,
    processed: orders.length,
    offset,
    limit,
    hasMore: offset + orders.length < totalEligible,
    nextOffset: offset + orders.length,
    summary: { updated, skipped, noCoupon, errors },
    results,
  });
}
