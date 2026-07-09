import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { sendOgfSyncSummaryEmail } from "@/lib/maileroo";
import { logOgfEmail } from "@/lib/ogf-email-log";

const OGF_NOTIFY_EMAIL = "chami@cosmetics.lk";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const batchCode = request.nextUrl.searchParams.get("batch");
  if (!batchCode) return NextResponse.json({ error: "?batch= required" }, { status: 400 });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

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

  const result = await sendOgfSyncSummaryEmail(OGF_NOTIFY_EMAIL, orders.length, batchCode, emailRows);

  await logOgfEmail({
    companyId,
    batchCode,
    orderCount: orders.length,
    emailTo: OGF_NOTIFY_EMAIL,
    status: result.success ? "sent" : "failed",
    errorMessage: result.success ? undefined : (result.message ?? "Unknown error"),
    source: "manual",
  });

  return NextResponse.json({ ok: result.success, orders: orders.length, batch: batchCode, message: result.message });
}
