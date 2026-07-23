import { NextRequest, NextResponse } from "next/server";

import {
  buildPickListAggregationForOrders,
  toPdfLocations,
} from "@/lib/pick-list-data";
import { generatePickListPdf } from "@/lib/pick-list-pdf";
import {
  formatPickListGroupLabel,
  getPickListGroupOrderIds,
  markPickListGroupDownloaded,
} from "@/lib/pick-list-groups";
import { prisma } from "@/lib/prisma";
import { formatAppIsoDate, formatAppIsoDateTime } from "@/lib/format-datetime";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAnyPermission(["fulfillment.order_print.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const { id } = await context.params;
  const groupIdResult = cuidSchema.safeParse(id);
  if (!groupIdResult.success) {
    return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
  }

  const groupMeta = await prisma.pickListGroup.findFirst({
    where: { id: groupIdResult.data, companyId },
    select: {
      id: true,
      createdAt: true,
      downloadedAt: true,
      printedBy: { select: { name: true, knownName: true, email: true } },
    },
  });
  if (!groupMeta) {
    return NextResponse.json({ error: "Pick list group not found" }, { status: 404 });
  }

  const groupOrders = await getPickListGroupOrderIds(companyId, groupIdResult.data);
  if (!groupOrders || groupOrders.orderIds.length === 0) {
    return NextResponse.json({ error: "No orders in this group" }, { status: 404 });
  }

  const [aggregation, company] = await Promise.all([
    buildPickListAggregationForOrders(companyId, groupOrders.orderIds),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);

  if (aggregation.locationGroups.length === 0) {
    return NextResponse.json({ error: "No pick list items found" }, { status: 404 });
  }

  const printedByName =
    groupMeta.printedBy.knownName?.trim() ||
    groupMeta.printedBy.name?.trim() ||
    groupMeta.printedBy.email?.trim() ||
    null;
  const dateLabel = formatAppIsoDate(groupMeta.createdAt);
  const headerLine = formatPickListGroupLabel(groupMeta.createdAt, printedByName);

  const pdf = await generatePickListPdf(
    toPdfLocations(aggregation.locationGroups),
    dateLabel,
    company?.name ?? null,
    headerLine,
  );

  if (!groupMeta.downloadedAt) {
    await markPickListGroupDownloaded(companyId, groupIdResult.data);
  }

  const stamp = formatAppIsoDateTime(groupMeta.createdAt).replace(/[: ]/g, "-");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pick-list-bulk-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
