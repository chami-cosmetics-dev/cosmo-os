import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { generateDispatchGroupPdf } from "@/lib/dispatch-pdf";
import { createZip } from "@/lib/falcon-upload";
import { resolveFalconExportGroupKey } from "@/lib/falcon-waybill-brand";
import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";
import { resolveOrderMerchantLabel } from "@/lib/order-merchant-coupon";
import { prisma } from "@/lib/prisma";
import { buildCsv, formatDispatchOrderReference } from "@/lib/reports/csv";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function printedDateIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

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

function resolveDateRange(from: string | null, to: string | null): DateRange | null {
  const fromTrimmed = from?.trim() ?? "";
  if (!fromTrimmed) return null;

  const parsed = parseDateRange(fromTrimmed, to?.trim() || fromTrimmed);
  if (parsed) return parsed;

  const today = todayIso();
  const [y, m, d] = today.split("-").map(Number);
  return {
    from: new Date(y, m - 1, d, 0, 0, 0, 0),
    to: new Date(y, m - 1, d, 23, 59, 59, 999),
    dateFrom: today,
    dateTo: today,
  };
}

function dispatchSummaryFileSuffix(
  status: "pending" | "completed",
  range: DateRange | null,
): string {
  if (!range) {
    return status === "pending" ? "pending-all" : "all";
  }
  if (status === "pending") return `pending-${range.dateFrom}`;
  return range.dateFrom === range.dateTo
    ? range.dateFrom
    : `${range.dateFrom}_to_${range.dateTo}`;
}

type DateRange = NonNullable<ReturnType<typeof parseDateRange>>;

type DispatchGroup = {
  dispatcherId: string;
  dispatcherName: string;
  dispatchType: "rider" | "courier" | "customer";
  orders: Array<{
    orderId: string;
    reference: string;
    shopifyReference: string;
    erpReference: string | null;
    companyGroup: string;
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
  const dispatchedAtFilter = range
    ? { gte: range.from, lte: range.to }
    : undefined;

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      ...(status === "pending"
        ? {
            dispatchedAt: dispatchedAtFilter ?? { not: null },
            deliveryCompleteAt: null,
            fulfillmentStage: { notIn: ["returned", "returned_to_store"] },
          }
        : {
            OR: [
              { fulfillmentStage: { in: ["delivery_complete", "invoice_complete"] } },
              { deliveryCompleteAt: { not: null } },
            ],
            ...(dispatchedAtFilter ? { dispatchedAt: dispatchedAtFilter } : {}),
          }),
    },
    orderBy: { dispatchedAt: "asc" },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      erpnextInvoiceId: true,
      customerPhone: true,
      customerEmail: true,
      shippingAddress: true,
      billingAddress: true,
      rawPayload: true,
      totalPrice: true,
      currency: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      createdAt: true,
      dispatchedAt: true,
      dispatchedToCustomer: true,
      deliveryCompleteAt: true,
      deliveryOutcome: true,
      sourceName: true,
      discountCodes: true,
      dispatchedByRider: { select: { id: true, name: true } },
      dispatchedByCourierService: { select: { id: true, name: true } },
      dispatchedBy: { select: { id: true, name: true } },
      companyLocation: { select: { name: true } },
      assignedMerchant: { select: { name: true, email: true, couponCodes: true } },
    },
  });

  const groupMap = new Map<string, DispatchGroup>();

  for (const order of orders) {
    const isCustomerPickup = order.dispatchedToCustomer;
    const isRider = !isCustomerPickup && !!order.dispatchedByRider;
    const isCourier = !isCustomerPickup && !isRider && !!order.dispatchedByCourierService;
    const dispatcherId = isCustomerPickup
      ? "customer-pickup"
      : isRider
        ? order.dispatchedByRider!.id
        : isCourier
          ? order.dispatchedByCourierService!.id
          : order.dispatchedBy?.id ?? "unspecified-dispatch";
    const dispatcherName = isCustomerPickup
      ? "Customer pickup"
      : isRider
        ? (order.dispatchedByRider!.name ?? "Unknown Rider")
        : isCourier
          ? (order.dispatchedByCourierService!.name ?? "Unknown Courier")
          : (order.dispatchedBy?.name ?? "Unspecified dispatch");
    const dispatchType: "rider" | "courier" | "customer" = isCustomerPickup
      ? "customer"
      : isRider
        ? "rider"
        : "courier";

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
    const addressParts = [
      addr?.address1,
      addr?.address2,
      addr?.city,
      addr?.province,
      addr?.province_code,
      addr?.country,
      addr?.zip,
    ]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    const address = addressParts.length > 0 ? Array.from(new Set(addressParts)).join(", ") : null;
    const customerAddress = [address, city].filter(Boolean).join(", ") || null;

    const paymentType =
      order.paymentGatewayPrimary ??
      (Array.isArray(order.paymentGatewayNames) && order.paymentGatewayNames.length > 0
        ? (order.paymentGatewayNames[0] as string)
        : null);

    groupMap.get(dispatcherId)!.orders.push({
      orderId: order.id,
      reference: formatDispatchOrderReference(order),
      shopifyReference: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      erpReference:
        order.erpnextInvoiceId &&
        order.erpnextInvoiceId !== "pending" &&
        order.erpnextInvoiceId !== "pending_approval"
          ? order.erpnextInvoiceId
          : null,
      companyGroup: resolveFalconExportGroupKey({
        reference: order.name ?? order.orderNumber ?? order.shopifyOrderId,
        locationName: order.companyLocation.name,
      }),
      orderDate: order.createdAt.toISOString(),
      dispatchedAt: order.dispatchedAt?.toISOString() ?? order.createdAt.toISOString(),
      deliveryCompleteAt: order.deliveryCompleteAt?.toISOString() ?? null,
      deliveryOutcome: order.deliveryOutcome ?? null,
      customerName,
      customerPhone:
        resolveCustomerPhone({
          customerPhone: order.customerPhone,
          shippingAddress: order.shippingAddress,
          billingAddress: order.billingAddress,
          rawPayload: order.rawPayload,
        }) ?? null,
      customerAddress,
      city,
      address,
      merchantName: resolveOrderMerchantLabel({
        assignedMerchant: order.assignedMerchant,
        sourceName: order.sourceName,
        discountCodes: order.discountCodes,
        rawPayload: order.rawPayload,
        assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      }),
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
    riderOrders: orders.filter((o) => o.dispatchedByRider && !o.dispatchedToCustomer).length,
    courierOrders: orders.filter((o) => !o.dispatchedToCustomer && !o.dispatchedByRider).length,
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
  const range = resolveDateRange(dateFrom, dateTo);

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
  const format = body.format === "csv" ? "csv" : body.format === "xlsx" ? "xlsx" : "pdf";
  const range = resolveDateRange(body.dateFrom ?? null, body.dateTo ?? null);

  const { groups } = await fetchDispatchGroups(companyId, status, range);
  if (groups.length === 0)
    return NextResponse.json({ error: "No dispatches found." }, { status: 404 });

  const fileSuffix = dispatchSummaryFileSuffix(status, range);

  const headers = [
    "company_group",
    "dispatcher_type",
    "dispatcher_name",
    "reference",
    "shopify_reference",
    "erp_reference",
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
      company_group: order.companyGroup,
      dispatcher_type: group.dispatchType,
      dispatcher_name: group.dispatcherName,
      reference: order.reference,
      shopify_reference: order.shopifyReference,
      erp_reference: order.erpReference ?? "",
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

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows, { header: [...headers] });
    XLSX.utils.book_append_sheet(workbook, sheet, "Dispatch Summary");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="dispatch-summary-${fileSuffix}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "csv") {
    const headers = [
      "company_group",
      "dispatcher_type",
      "dispatcher_name",
      "reference",
      "shopify_reference",
      "erp_reference",
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

    const emptyRow = (label: string, total: number, currency: string) => ({
      company_group: "",
      dispatcher_type: "",
      dispatcher_name: label,
      reference: "",
      shopify_reference: "",
      erp_reference: "",
      location: "",
      order_date: "",
      dispatched_at: "",
      delivery_complete_at: "",
      delivery_outcome: "",
      customer_name: "",
      customer_phone: "",
      city: "",
      address: "",
      merchant: "",
      payment_type: "TOTAL",
      total: total.toFixed(2),
      currency,
    });

    const rows = groups.flatMap((group) => {
      const orderRows = group.orders.map((order) => ({
        company_group: order.companyGroup,
        dispatcher_type: group.dispatchType,
        dispatcher_name: group.dispatcherName,
        reference: order.reference,
        shopify_reference: order.shopifyReference,
        erp_reference: order.erpReference ?? "",
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
      }));
      const groupTotal = group.orders.reduce((sum, o) => sum + (parseFloat(o.totalPrice) || 0), 0);
      const currency = group.orders[0]?.currency ?? "";
      return [...orderRows, emptyRow(`${group.dispatcherName} TOTAL (${group.orders.length} orders)`, groupTotal, currency)];
    });

    const grandTotal = rows.filter(r => r.payment_type === "TOTAL").reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
    const grandCurrency = groups[0]?.orders[0]?.currency ?? "";
    rows.push(emptyRow(`GRAND TOTAL (${groups.flatMap(g => g.orders).length} orders)`, grandTotal, grandCurrency));

    const companyGroups = Array.from(new Set(rows.map((row) => row.company_group))).sort();
    if (companyGroups.length <= 1) {
      const csv = buildCsv(headers, rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dispatch-summary-${fileSuffix}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csvFiles = companyGroups.map((companyGroup) => ({
      name: `dispatch-summary-${fileSuffix}-${companyGroup}.csv`,
      content: buildCsv(
        headers,
        rows.filter((row) => row.company_group === companyGroup)
      ),
    }));

    const zip = createZip(csvFiles);
    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dispatch-summary-${fileSuffix}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const printDate = printedDateIso();
  const pdfDateFrom = range?.dateFrom ?? printDate;
  const pdfDateTo = range?.dateTo ?? printDate;

  const files: Array<{ name: string; content: Buffer }> = [];
  for (const group of groups) {
    const pdf = await generateDispatchGroupPdf(group, pdfDateFrom, pdfDateTo);
    const safeName = group.dispatcherName
      .replace(/[^a-zA-Z0-9_ -]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const typePrefix =
      group.dispatchType === "rider"
        ? "rider"
        : group.dispatchType === "customer"
          ? "customer-pickup"
          : "courier";
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
