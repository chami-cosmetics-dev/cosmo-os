import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { sendOgfSyncSummaryEmail } from "@/lib/maileroo";

// Temporary one-shot endpoint — remove after use
export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const batchCode = request.nextUrl.searchParams.get("batch");
  if (!batchCode) return NextResponse.json({ error: "?batch= required" }, { status: 400 });

  type Row = { orderNumber: string | null; name: string | null; totalPrice: string; paymentGatewayPrimary: string | null };
  const orders = await prisma.$queryRaw<Row[]>`
    SELECT "orderNumber", "name", "totalPrice", "paymentGatewayPrimary"
    FROM "Order"
    WHERE "ogfSyncBatchCode" = ${batchCode}
    ORDER BY "createdAt" ASC
  `;

  if (!orders.length) return NextResponse.json({ error: `No orders for batch ${batchCode}` }, { status: 404 });

  const emailRows = orders.map((o) => ({
    receiptNo: o.orderNumber ?? o.name?.replace(/^#/, "") ?? "?",
    totalStr: Number(o.totalPrice).toFixed(2),
    paymentMethod: /card|visa|master|amex|koko/i.test(o.paymentGatewayPrimary ?? "") ? "Card" : "Cash",
  }));

  const result = await sendOgfSyncSummaryEmail("chami@cosmetics.lk", orders.length, batchCode, emailRows);
  return NextResponse.json({ ok: result.success, orders: orders.length, batch: batchCode, message: result.message });
}
