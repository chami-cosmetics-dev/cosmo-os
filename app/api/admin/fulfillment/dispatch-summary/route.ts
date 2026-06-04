import { NextRequest, NextResponse } from "next/server";

import { generateDispatchGroupPdf } from "@/lib/dispatch-pdf";
import { createZip } from "@/lib/falcon-upload";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseDateRange(from: string | null, to: string | null) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !re.test(from)) return null;
  const toStr = to && re.test(to) ? to : from;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return {
    from: new Date(fy, fm - 1, fd, 0, 0, 0, 0),
    to: new Date(ty, tm - 1, td, 23, 59, 59, 999),
    dateFrom: from,
    dateTo: toStr,
  };
}

type DateRange = NonNullable<ReturnType<typeof parseDateRange>>;

type DispatchGroup = {
  dispatcherId: string;
  dispatcherName: string;
  dispatchType: "rider" | "courier";
  orders: Array<{
    orderId: string;
    reference: string;
    orderDate: string;
    customerName: string;
    customerPhone: string | null;
    customerAddress: string | null;
    city: string | null;
    address: string | null;
    merchantName: string | null;
    totalPrice: string;
    currency: string;
    paymentType: string | null;
    locationName: string;
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
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      createdAt: true,
      dispatchedAt: true,
      dispatchedByRider: { select: { id: true, name: true } },
      dispatchedByCourierService: { select: { id: true, name: true } },
      companyLocation: { select: { name: true } },
      assignedMerchant: { select: { name: true } },
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

    const city = typeof addr?.city === "string" && addr.city ? addr.city : null;
    const address = typeof addr?.address1 === "string" && addr.address1 ? addr.address1 : null;
    const customerAddress = [address, city].filter(Boolean).join(", ") || null;

    const paymentType =
      order.paymentGatewayPrimary ??
      (Array.isArray(order.paymentGatewayNames) && order.paymentGatewayNames.length > 0
        ? (order.paymentGatewayNames[0] as string)
        : null);

    groupMap.get(dispatcherId)!.orders.push({
      orderId: order.id,
      reference: order.name ?? order.orderNumber ?? order.erpnextInvoiceId ?? order.id,
      orderDate: order.createdAt.toISOString(),
      customerName,
      customerPhone: order.customerPhone,
      customerAddress,
      city,
      address,
      merchantName: order.assignedMerchant?.name ?? null,
      totalPrice: order.totalPrice.toString(),
      currency: order.currency ?? "LKR",
      paymentType,
      locationName: order.companyLocation.name,
    });
  }

  const groups = Array.from(groupMap.values())
    .sort((a, b) => {
      if (a.dispatchType !== b.dispatchType) return a.dispatchType === "rider" ? -1 : 1;
      return a.dispatcherName.localeCompare(b.dispatcherName);
    })
    .map((g) => ({
      ...g,
      orders: [...g.orders].sort((a, b) => a.reference.localeCompare(b.reference)),
    }));

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

  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  const range = parseDateRange(dateFrom, dateTo);
  if (!range) return NextResponse.json({ error: "Provide a valid dateFrom (YYYY-MM-DD)." }, { status: 400 });

  const [data, company] = await Promise.all([
    fetchDispatchGroups(companyId, range),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  return NextResponse.json({ dateFrom: range.dateFrom, dateTo: range.dateTo, companyName: company?.name ?? null, ...data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.ready_dispatch.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { dateFrom?: string; dateTo?: string };
  const range = parseDateRange(body.dateFrom ?? null, body.dateTo ?? null);
  if (!range) return NextResponse.json({ error: "Provide a valid dateFrom (YYYY-MM-DD)." }, { status: 400 });

  const { groups } = await fetchDispatchGroups(companyId, range);
  if (groups.length === 0) return NextResponse.json({ error: "No dispatches found for this date range." }, { status: 404 });

  const files: Array<{ name: string; content: Buffer }> = [];
  for (const group of groups) {
    const pdf = await generateDispatchGroupPdf(group, range.dateFrom, range.dateTo);
    const safeName = group.dispatcherName
      .replace(/[^a-zA-Z0-9_ -]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const typePrefix = group.dispatchType === "rider" ? "rider" : "courier";
    const dateSuffix = range.dateFrom === range.dateTo ? range.dateFrom : `${range.dateFrom}_to_${range.dateTo}`;
    files.push({ name: `${typePrefix}-${safeName}-${dateSuffix}.pdf`, content: pdf });
  }

  const zipSuffix = range.dateFrom === range.dateTo ? range.dateFrom : `${range.dateFrom}_to_${range.dateTo}`;
  const zip = createZip(files);

  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dispatch-summary-${zipSuffix}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
