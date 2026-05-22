import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  findOrderWaybillsByInvoice,
  normalizeInvoiceLookup,
  saveOrderWaybill,
} from "@/lib/order-waybills";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const saveWaybillSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(100),
  waybillNo: z.string().trim().min(1).max(100),
  courierName: z.string().trim().max(200).optional().nullable(),
});

async function requireWaybillAuth() {
  const auth = await requireAnyPermission([
    "fulfillment.waybill_lookup.read",
    "fulfillment.waybill_lookup.import",
  ]);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }),
    };
  }

  return { ok: true as const, companyId };
}

export async function GET(request: NextRequest) {
  const auth = await requireWaybillAuth();
  if (!auth.ok) return auth.response;

  const query =
    request.nextUrl.searchParams.get("q") ??
    request.nextUrl.searchParams.get("invoice") ??
    request.nextUrl.searchParams.get("waybill") ??
    "";
  if (!normalizeInvoiceLookup(query)) {
    return NextResponse.json({ error: "Enter an invoice or waybill number." }, { status: 400 });
  }

  const result = await findOrderWaybillsByInvoice(auth.companyId, query);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.waybill_lookup.import"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = saveWaybillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid waybill details." }, { status: 400 });
  }

  const lookup = await findOrderWaybillsByInvoice(companyId, parsed.data.invoiceNumber);
  if (!lookup.order) {
    return NextResponse.json({ error: "No order matched that invoice number." }, { status: 404 });
  }

  await saveOrderWaybill({
    companyId,
    orderId: lookup.order.id,
    invoiceNumber: lookup.order.name ?? lookup.order.orderNumber ?? lookup.order.shopifyOrderId,
    waybillNo: parsed.data.waybillNo,
    courierName: parsed.data.courierName || lookup.order.courierName,
    source: "manual",
  });

  const result = await findOrderWaybillsByInvoice(companyId, parsed.data.invoiceNumber);
  return NextResponse.json(result);
}
