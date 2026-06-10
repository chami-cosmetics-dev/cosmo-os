import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { generatePickListPdf } from "@/lib/pick-list-pdf";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseDateParam(value: string | null): { from: Date; to: Date; label: string } | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!value || !re.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return {
    from: new Date(y!, m! - 1, d!, 0, 0, 0, 0),
    to: new Date(y!, m! - 1, d!, 23, 59, 59, 999),
    label: value,
  };
}

type PickListItem = {
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
};

type LocationGroup = {
  locationId: string;
  locationName: string;
  items: PickListItem[];
  totalUnits: number;
};

async function fetchPickListData(companyId: string, date: { from: Date; to: Date }) {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      printCount: { gt: 0 },
      lastPrintedAt: { gte: date.from, lte: date.to },
      financialStatus: { not: "voided" },
    },
    select: {
      companyLocation: { select: { id: true, name: true } },
      lineItems: {
        select: {
          quantity: true,
          productItem: {
            select: {
              id: true,
              productTitle: true,
              variantTitle: true,
              sku: true,
              barcode: true,
            },
          },
        },
      },
    },
    orderBy: [{ companyLocation: { name: "asc" } }, { lastPrintedAt: "asc" }],
  });

  const locationMap = new Map<
    string,
    { name: string; items: Map<string, PickListItem> }
  >();

  for (const order of orders) {
    const locationId = order.companyLocation?.id ?? "no-location";
    const locationName = order.companyLocation?.name ?? "No Location";

    if (!locationMap.has(locationId)) {
      locationMap.set(locationId, { name: locationName, items: new Map() });
    }
    const loc = locationMap.get(locationId)!;

    for (const li of order.lineItems) {
      const p = li.productItem;
      const existing = loc.items.get(p.id);
      if (existing) {
        existing.quantity += li.quantity;
      } else {
        loc.items.set(p.id, {
          productTitle: p.productTitle,
          variantTitle: p.variantTitle,
          sku: p.sku,
          barcode: p.barcode,
          quantity: li.quantity,
        });
      }
    }
  }

  const locationGroups: LocationGroup[] = [...locationMap.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([locationId, loc]) => {
      const items = [...loc.items.values()].sort((a, b) =>
        a.productTitle.localeCompare(b.productTitle),
      );
      return {
        locationId,
        locationName: loc.name,
        items,
        totalUnits: items.reduce((s, i) => s + i.quantity, 0),
      };
    });

  return {
    orderCount: orders.length,
    totalLocations: locationGroups.length,
    totalUnits: locationGroups.reduce((s, g) => s + g.totalUnits, 0),
    locationGroups,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.order_print.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const date = parseDateParam(request.nextUrl.searchParams.get("date"));
  if (!date) {
    return NextResponse.json({ error: "Provide a valid date (YYYY-MM-DD)." }, { status: 400 });
  }

  const data = await fetchPickListData(companyId, date);
  return NextResponse.json({ date: date.label, ...data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.order_print.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const date = parseDateParam(body.date ?? null);
  if (!date) {
    return NextResponse.json({ error: "Provide a valid date (YYYY-MM-DD)." }, { status: 400 });
  }

  const [data, company] = await Promise.all([
    fetchPickListData(companyId, date),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);

  if (data.locationGroups.length === 0) {
    return NextResponse.json({ error: "No printed orders found for this date." }, { status: 404 });
  }

  const pdf = await generatePickListPdf(data.locationGroups, date.label, company?.name ?? null);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pick-list-${date.label}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
