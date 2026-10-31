import { NextResponse } from "next/server";

import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { loadMarginIssuesReport, ropFulfillmentBand } from "@/lib/margin-issues";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function currentCycleStart(reportDate: string): Date {
  const date = new Date(`${reportDate}T00:00:00Z`);
  const month = date.getUTCMonth();
  const cycleMonth = 8 + Math.floor(((month - 8 + 12) % 12) / 3) * 3;
  const year = month < 8 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
  return new Date(Date.UTC(year, cycleMonth, 1));
}

function isoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function context() {
  const user = await getCurrentUserContext();
  if (!user?.user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!hasPermission(user, "purchasing.purchase_history.read")) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!user.user.companyId) return { response: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }) };
  return { companyId: user.user.companyId };
}

export async function GET() {
  const auth = await context();
  if ("response" in auth) return auth.response;
  const reportDate = getCurrentColomboReportDate();
  const cycleStart = currentCycleStart(reportDate);
  await prisma.highRiskReorderRecord.updateMany({
    where: { companyId: auth.companyId, status: "active", cycleStart: { lt: cycleStart } },
    data: { status: "archived", archivedAt: new Date() },
  });

  const report = await loadMarginIssuesReport(auth.companyId, reportDate);
  const candidates = report.details.filter(
    (row) => row.priority.toLowerCase() === "top" && ropFulfillmentBand(row.stockAvailable, row.totalRop) === "0-10",
  );
  for (const row of candidates) {
    const existing = await prisma.highRiskReorderRecord.findFirst({
      where: { companyId: auth.companyId, cycleStart, sku: row.sku, status: "active" },
    });
    if (!existing) {
      await prisma.highRiskReorderRecord.create({
        data: {
          companyId: auth.companyId,
          cycleStart,
          sku: row.sku,
          totalRop: Math.max(0, Math.round(row.totalRop)),
          totalStock: row.stockAvailable,
          reorderQty: Math.max(0, Math.ceil(row.totalRop - row.stockAvailable)),
          bestPrice: row.latestPurchasePrice,
          bestSupplier: row.latestPurchaseSupplier,
        },
      });
    } else {
      await prisma.highRiskReorderRecord.update({
        where: { id: existing.id },
        data: {
          totalRop: Math.max(0, Math.round(row.totalRop)),
          totalStock: row.stockAvailable,
          reorderQty: Math.max(0, Math.ceil(row.totalRop - row.stockAvailable)),
          bestPrice: row.latestPurchasePrice,
          bestSupplier: row.latestPurchaseSupplier,
        },
      });
    }
  }

  const rows = await prisma.highRiskReorderRecord.findMany({
    where: { companyId: auth.companyId, cycleStart, status: "active" },
    orderBy: [{ orderPlaced: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ reportDate, cycleStart: cycleStart.toISOString().slice(0, 10), rows });
}

export async function PATCH(request: Request) {
  const auth = await context();
  if ("response" in auth) return auth.response;
  if (!hasPermission(await getCurrentUserContext(), "purchasing.osf.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as {
    id?: string; orderPlaced?: boolean; orderQty?: number | null; orderSupplier?: string | null;
    orderReceiveDate?: string | null; reasonType?: string | null; replacementSku?: string | null;
    changedPriority?: string | null; otherReason?: string | null;
  };
  if (!body.id) return NextResponse.json({ error: "Record id is required" }, { status: 400 });
  const existing = await prisma.highRiskReorderRecord.findFirst({ where: { id: body.id, companyId: auth.companyId, status: "active" } });
  if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  const reasonType = body.reasonType === undefined ? existing.reasonType : body.reasonType?.trim() || null;
  if (reasonType === "Replace" && "replacementSku" in body && !body.replacementSku?.trim()) return NextResponse.json({ error: "Replacement SKU is required" }, { status: 400 });
  if (reasonType === "Priority change" && "changedPriority" in body && !body.changedPriority?.trim()) return NextResponse.json({ error: "Changed priority is required" }, { status: 400 });
  if (reasonType === "Other" && "otherReason" in body && !body.otherReason?.trim()) return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  const orderQty = body.orderQty == null ? null : Math.max(0, Math.floor(Number(body.orderQty)));
  const placed = Boolean(body.orderPlaced);
  const fulfilled = placed && orderQty != null && orderQty >= existing.reorderQty;
  const row = await prisma.highRiskReorderRecord.update({
    where: { id: existing.id },
    data: {
      orderPlaced: placed, orderQty, orderSupplier: body.orderSupplier?.trim() || null,
      orderReceiveDate: isoDate(body.orderReceiveDate), reasonType,
      replacementSku: reasonType === "Replace" ? body.replacementSku?.trim() : null,
      changedPriority: reasonType === "Priority change" ? body.changedPriority?.trim() : null,
      otherReason: reasonType === "Other" ? body.otherReason?.trim() : null,
      status: fulfilled ? "fulfilled" : "active", fulfilledAt: fulfilled ? new Date() : null,
    },
  });
  return NextResponse.json({ row });
}
