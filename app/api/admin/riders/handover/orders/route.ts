import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildHandoverOrders,
  groupCashByErpCompany,
  groupDeliveriesByCompany,
  handoverDeliveryMatchesQuery,
  handoverReceiptsCovering,
  handoverSummaryCashAmount,
  latestReceiptForCompany,
  loadScopedRiderHandoverDeliveries,
} from "@/lib/rider-handover";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  riderId: cuidSchema,
  from: z.string(),
  to: z.string(),
  q: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("riders.handover.receive");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  const userId = auth.context!.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = querySchema.safeParse({
    riderId: request.nextUrl.searchParams.get("riderId") ?? "",
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
    q: request.nextUrl.searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const loaded = await loadScopedRiderHandoverDeliveries({
    companyId,
    userId,
    roleNames: auth.context!.roleNames,
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

  const matched = loaded.deliveries.filter((delivery) =>
    handoverDeliveryMatchesQuery(delivery, parsed.data.q ?? ""),
  );
  const coveringReceipts = await handoverReceiptsCovering({
    companyId,
    riderId: loaded.riderId,
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
  });
  const companies = await Promise.all(
    groupDeliveriesByCompany(matched).map(async (group) => {
      const orders = await buildHandoverOrders(group.deliveries);
      const cash = groupCashByErpCompany(
        group.deliveries.map((delivery) => ({
          erpnextCompany: delivery.erpnextCompany,
          locationName: delivery.locationName,
          cashAmount: handoverSummaryCashAmount(delivery),
          payment: delivery.payment,
        })),
      );
      const received = latestReceiptForCompany(coveringReceipts, group.companyName);
      return {
        companyName: group.companyName,
        cashAmount: cash.companies[0]?.cashAmount ?? "0.00",
        receivedAt: received?.receivedAt ?? null,
        receivedByName: received?.receivedByName ?? null,
        orders,
      };
    }),
  );

  return NextResponse.json({
    riderId: loaded.riderId,
    riderName: loaded.riderName,
    from: parsed.data.from,
    to: parsed.data.to,
    companies,
    total: matched.length,
  });
}
