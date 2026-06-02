import { NextRequest, NextResponse } from "next/server";

import { generateDispatchGroupPdf } from "@/lib/dispatch-pdf";
import { createZip } from "@/lib/falcon-upload";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return {
    from: new Date(year, month - 1, day, 0, 0, 0, 0),
    to: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
}

type DateRange = NonNullable<ReturnType<typeof parseDate>>;

type DispatchGroup = {
  dispatcherId: string;
  dispatcherName: string;
  dispatchType: "rider" | "courier";
  orders: Array<{
    orderId: string;
    reference: string;
    customerName: string;
    customerPhone: string | null;
    totalPrice: string;
    currency: string;
    financialStatus: string | null;
    dispatchedAt: string;
    locationName: string;
    items: Array<{ title: string; qty: number }>;
  }>;
};

async function fetchDispatchGroups(companyId: string, range: DateRange) {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      dispatchedAt: { gte: range.from, lte: range.to },
      OR: [
        { dispatchedByRiderId: { not: null } },
        { dispatchedByCourierServiceId: { not: null } },
      ],
    },
    orderBy: { dispatchedAt: "asc" },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      customerPhone: true,
      customerEmail: true,
      shippingAddress: true,
      totalPrice: true,
      currency: true,
      financialStatus: true,
      dispatchedAt: true,
      dispatchedByRider: { select: { id: true, name: true } },
      dispatchedByCourierService: { select: { id: true, name: true } },
      companyLocation: { select: { name: true } },
      lineItems: {
        select: {
          quantity: true,
          productItem: { select: { productTitle: true, variantTitle: true } },
        },
      },
    },
  });

  const groupMap = new Map<string, DispatchGroup>();

  for (const order of orders) {
    const isRider = !!order.dispatchedByRider;
    const dispatcherId = isRider
      ? order.dispatchedByRider!.id
      : order.dispatchedByCourierService!.id;
    const dispatcherName = isRider
      ? (order.dispatchedByRider!.name ?? "Unknown Rider")
      : (order.dispatchedByCourierService!.name ?? "Unknown Courier");
    const dispatchType: "rider" | "courier" = isRider ? "rider" : "courier";

    if (!groupMap.has(dispatcherId)) {
      groupMap.set(dispatcherId, { dispatcherId, dispatcherName, dispatchType, orders: [] });
    }

    const addr = order.shippingAddress as Record<string, unknown> | null;
    const customerName =
      (typeof addr?.name === "string" ? addr.name : null) ||
      (typeof addr?.first_name === "string"
        ? [addr.first_name, addr.last_name].filter(Boolean).join(" ")
        : null) ||
      order.customerEmail ||
      order.customerPhone ||
      "—";

    groupMap.get(dispatcherId)!.orders.push({
      orderId: order.id,
      reference: order.name ?? order.orderNumber ?? order.erpnextInvoiceId ?? order.id,
      customerName,
      customerPhone: order.customerPhone,
      totalPrice: order.totalPrice.toString(),
      currency: order.currency ?? "LKR",
      financialStatus: order.financialStatus,
      dispatchedAt: order.dispatchedAt!.toISOString(),
      locationName: order.companyLocation.name,
      items: order.lineItems.map((li) => ({
        title: [li.productItem.productTitle, li.productItem.variantTitle]
          .filter(Boolean)
          .join(" — "),
        qty: li.quantity,
      })),
    });
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.dispatchType !== b.dispatchType) return a.dispatchType === "rider" ? -1 : 1;
    return a.dispatcherName.localeCompare(b.dispatcherName);
  });

  return {
    groups,
    totalOrders: orders.length,
    riderOrders: orders.filter((o) => o.dispatchedByRider).length,
    courierOrders: orders.filter((o) => o.dispatchedByCourierService && !o.dispatchedByRider).length,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.ready_dispatch.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const dateStr = request.nextUrl.searchParams.get("date");
  const range = parseDate(dateStr);
  if (!range) return NextResponse.json({ error: "Provide a valid date (YYYY-MM-DD)." }, { status: 400 });

  const data = await fetchDispatchGroups(companyId, range);
  return NextResponse.json({ date: dateStr, ...data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.ready_dispatch.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const range = parseDate(body.date ?? null);
  if (!range) return NextResponse.json({ error: "Provide a valid date (YYYY-MM-DD)." }, { status: 400 });

  const { groups } = await fetchDispatchGroups(companyId, range);
  if (groups.length === 0) return NextResponse.json({ error: "No dispatches found for this date." }, { status: 404 });

  const files: Array<{ name: string; content: Buffer }> = [];
  for (const group of groups) {
    const pdf = await generateDispatchGroupPdf(group, body.date!);
    const safeName = group.dispatcherName
      .replace(/[^a-zA-Z0-9_ -]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const typePrefix = group.dispatchType === "rider" ? "rider" : "courier";
    files.push({ name: `${typePrefix}-${safeName}-${body.date}.pdf`, content: pdf });
  }

  const zip = createZip(files);

  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dispatch-summary-${body.date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
