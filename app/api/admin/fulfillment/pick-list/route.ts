import { NextRequest, NextResponse } from "next/server";

import { fetchSinglePrintPickList, fetchTodayUngroupedPrintOrderIds, toPdfLocations } from "@/lib/pick-list-data";
import { formatPickListTodayLabel } from "@/lib/pick-list-date";
import { generatePickListPdf } from "@/lib/pick-list-pdf";
import { createPickListGroup, listPickListGroups } from "@/lib/pick-list-groups";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.order_print.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const view = request.nextUrl.searchParams.get("view") ?? "active";

  if (view === "history") {
    const historyGroups = await listPickListGroups(companyId, true);
    return NextResponse.json({ historyGroups });
  }

  const [activeGroups, singlePrints] = await Promise.all([
    listPickListGroups(companyId, false),
    fetchSinglePrintPickList(companyId),
  ]);

  return NextResponse.json({
    activeGroups,
    singlePrints,
    todayLabel: formatPickListTodayLabel(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { scope?: string };

  if (body.scope === "create_today_batch") {
    const auth = await requireAnyPermission(["fulfillment.order_print.print"]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const companyId = auth.context?.user?.companyId;
    const userId = auth.context?.user?.id;
    if (!companyId || !userId) {
      return NextResponse.json({ error: "No company" }, { status: 404 });
    }

    const orderIds = await fetchTodayUngroupedPrintOrderIds(companyId);
    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "No ungrouped orders printed today to add to a bulk batch." },
        { status: 404 },
      );
    }

    try {
      const group = await createPickListGroup(companyId, userId, orderIds);
      return NextResponse.json(group);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create bulk batch";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const auth = await requireAnyPermission(["fulfillment.order_print.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  if (body.scope !== "singles") {
    return NextResponse.json({ error: "Unsupported download scope" }, { status: 400 });
  }

  const [data, company] = await Promise.all([
    fetchSinglePrintPickList(companyId),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);

  if (data.locationGroups.length === 0) {
    return NextResponse.json({ error: "No single-print orders found." }, { status: 404 });
  }

  const dateLabel = formatPickListTodayLabel();
  const pdf = await generatePickListPdf(
    toPdfLocations(data.locationGroups),
    dateLabel,
    company?.name ?? null,
    "Single-print orders (today)",
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pick-list-singles-${dateLabel}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
