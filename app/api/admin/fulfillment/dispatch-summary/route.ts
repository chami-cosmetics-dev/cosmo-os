import { NextRequest, NextResponse } from "next/server";

import { generateDispatchGroupPdf } from "@/lib/dispatch-pdf";
import { createZip } from "@/lib/falcon-upload";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/reports/csv";
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
    dispatchedAt: string;
    deliveryCompleteAt: string | null;
    deliveryOutcome: string | null;
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

async function fetchDispatchGroups(
  companyId: string,
  status: "pending" | "completed",
  range: DateRange | null,
) {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      fulfillmentStage:
        status === "pending"
          ? "dispatched"
          : { in: ["delivery_complete", "invoice_complete"] },
      dispatchedAt:
        status === "completed" && range
          ? { gte: range.from, lte: range.to }
          : undefined,
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
      deliveryCompleteAt: true,
      deliveryOutcome: true,
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
      dispatchedAt: order.dispatchedAt?.toISOString() ?? order.createdAt.toISOString(),
      deliveryCompleteAt: order.deliveryCompleteAt?.toISOString() ?? null,
      deliveryOutcome: order.deliveryOutcome ?? null,
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
  if (!companyId)
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const status =
    request.nextUrl.searchParams.get("status") === "completed" ? "completed" : "pending";
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");
  const range = parseDateRange(dateFrom, dateTo);

  if (status === "completed" && !range) {
    return NextResponse.json(
      { error: "Provide a valid dateFrom (YYYY-MM-DD) for completed view." },
      { status: 400 },
    );
  }

  const [data, company] = await Promise.all([
    fetchDispatchGroups(companyId, status, range),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);

  return NextResponse.json({
    status,
    dateFrom: range?.dateFrom ?? null,
    dateTo: range?.dateTo ?? null,
    companyName: company?.name ?? null,
    ...data,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.ready_dispatch.read"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId)
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    format?: string;
  };

  const status = body.status === "completed" ? "completed" : "pending";
  const format = body.format === "csv" ? "csv" : "pdf";
  const range = parseDateRange(body.dateFrom ?? null, body.dateTo ?? null);

  if (status === "completed" && !range) {
    return NextResponse.json(
      { error: "Provide a valid dateFrom (YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const { groups } = await fetchDispatchGroups(companyId, status, range);
  if (groups.length === 0)
    return NextResponse.json({ error: "No dispatches found." }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const fileSuffix =
    status === "pending"
      ? `pending-${today}`
      : range!.dateFrom === range!.dateTo
        ? range!.dateFrom
        : `${range!.dateFrom}_to_${range!.dateTo}`;

  if (format === "csv") {
    const headers = [
      "dispatcher_type",
      "dispatcher_name",
      "reference",
      "location",
      "order_date",
      "dispatched_at",
      "delivery_complete_at",
      "delivery_outcome",
      "customer_name",
      "customer_phone",
      "city",
      "address",
      "merchant",
      "payment_type",
      "total",
      "currency",
    ] as const;

    const rows = groups.flatMap((group) =>
      group.orders.map((order) => ({
        dispatcher_type: group.dispatchType,
        dispatcher_name: group.dispatcherName,
        reference: order.reference,
        location: order.locationName,
        order_date: order.orderDate,
        dispatched_at: order.dispatchedAt,
        delivery_complete_at: order.deliveryCompleteAt ?? "",
        delivery_outcome: order.deliveryOutcome ?? "",
        customer_name: order.customerName,
        customer_phone: order.customerPhone ?? "",
        city: order.city ?? "",
        address: order.address ?? "",
        merchant: order.merchantName ?? "",
        payment_type: order.paymentType ?? "",
        total: order.totalPrice,
        currency: order.currency,
      })),
    );

    const csv = buildCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dispatch-summary-${fileSuffix}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdfDateFrom = range?.dateFrom ?? today;
  const pdfDateTo = range?.dateTo ?? today;

  const files: Array<{ name: string; content: Buffer }> = [];
  for (const group of groups) {
    const pdf = await generateDispatchGroupPdf(group, pdfDateFrom, pdfDateTo);
    const safeName = group.dispatcherName
      .replace(/[^a-zA-Z0-9_ -]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const typePrefix = group.dispatchType === "rider" ? "rider" : "courier";
    files.push({ name: `${typePrefix}-${safeName}-${fileSuffix}.pdf`, content: pdf });
  }

  const zip = createZip(files);

  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dispatch-summary-${fileSuffix}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
