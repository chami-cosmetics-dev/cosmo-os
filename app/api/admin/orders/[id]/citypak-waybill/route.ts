import { NextRequest, NextResponse } from "next/server";

import { loadCitypakWaybillPdfForOrder } from "@/lib/citypak-waybill-pdf";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAnyPermission([
    "fulfillment.ready_dispatch.dispatch",
    "fulfillment.ready_dispatch.read",
    "fulfillment.waybill_lookup.read",
    "fulfillment.falcon_upload.read",
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const { id } = await context.params;
  const parsed = cuidSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  const order = await prisma.order.findFirst({
    where: { id: parsed.data, companyId },
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const loaded = await loadCitypakWaybillPdfForOrder({
    companyId,
    orderId: order.id,
  });
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(loaded.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${loaded.filename}"`,
      "Cache-Control": "private, max-age=120",
    },
  });
}
