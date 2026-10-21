import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  groupCashByErpCompany,
  handoverCompanyName,
  handoverReceiptsCovering,
  handoverSummaryCashAmount,
  latestHandoverReceipt,
  latestReceiptForCompany,
  listHandoverCollectableOrders,
  loadRiderHandoverDeliveries,
} from "@/lib/rider-handover";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  riderId: cuidSchema,
  from: z.string(),
  to: z.string(),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("riders.handover.summary");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = querySchema.safeParse({
    riderId: request.nextUrl.searchParams.get("riderId") ?? "",
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const loaded = await loadRiderHandoverDeliveries({
    companyId,
    riderId: parsed.data.riderId,
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
  });
  if (!loaded.ok) {
    if (loaded.error === "rider_not_found") {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const grouped = groupCashByErpCompany(
    loaded.deliveries.map((delivery) => ({
      erpnextCompany: delivery.erpnextCompany,
      locationName: delivery.locationName,
      cashAmount: handoverSummaryCashAmount(delivery),
      payment: delivery.payment,
    })),
  );
  const visibleCompanies = new Set(
    loaded.deliveries.map((delivery) => handoverCompanyName(delivery.erpnextCompany, delivery.locationName)),
  );
  const [latestReceipt, coveringReceipts] = await Promise.all([
    latestHandoverReceipt({
      companyId,
      riderId: loaded.riderId,
      fromYmd: parsed.data.from,
      toYmd: parsed.data.to,
    }),
    handoverReceiptsCovering({
      companyId,
      riderId: loaded.riderId,
      fromYmd: parsed.data.from,
      toYmd: parsed.data.to,
    }),
  ]);
  const visibleReceipts = coveringReceipts.flatMap((receipt) => {
    if (receipt.handoverCompany) {
      return visibleCompanies.has(receipt.handoverCompany) ? [receipt] : [];
    }
    const companies = receipt.companies.filter((line) => visibleCompanies.has(line.companyName));
    if (companies.length === 0) return [];
    const fullTotal = companies
      .reduce((sum, line) => sum + Number(line.cashAmount), 0)
      .toFixed(2);
    return [{ ...receipt, companies, fullTotal }];
  });
  const exactVisible =
    latestReceipt &&
    (latestReceipt.handoverCompany
      ? visibleCompanies.has(latestReceipt.handoverCompany)
      : latestReceipt.companies.some((line) => visibleCompanies.has(line.companyName)))
      ? latestReceipt
      : null;

  return NextResponse.json({
    riderId: loaded.riderId,
    riderName: loaded.riderName,
    from: parsed.data.from,
    to: parsed.data.to,
    companies: grouped.companies.map((line) => {
      const received = latestReceiptForCompany(visibleReceipts, line.companyName);
      return {
        ...line,
        receivedAt: received?.receivedAt ?? null,
        receivedByName: received?.receivedByName ?? null,
      };
    }),
    fullTotal: grouped.fullTotal,
    collectableOrders: listHandoverCollectableOrders(loaded.deliveries),
    latestReceipt: exactVisible,
    coveringReceipts: visibleReceipts,
  });
}
