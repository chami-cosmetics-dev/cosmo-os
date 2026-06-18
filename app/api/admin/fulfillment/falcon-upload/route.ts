import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  buildGroupedFalconUploadZip,
  type FalconWaybillRow,
} from "@/lib/falcon-upload";
import { isCitypakCourier } from "@/lib/courier";
import { resolveFalconCompanyGroup, resolveFalconExportGroupKey } from "@/lib/falcon-waybill-brand";
import { getAddressField, resolveOrderCustomerName } from "@/lib/reports/csv";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

function parseDispatchDate(value: unknown) {
  const text = typeof value === "string" ? value : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map((part) => Number.parseInt(part, 10));
  return {
    label: text,
    from: new Date(year, month - 1, day, 0, 0, 0, 0),
    to: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
}

function isPrepaid(financialStatus: string | null) {
  const status = (financialStatus ?? "").toLowerCase();
  return status === "paid" || status === "partially_refunded" || status === "refunded";
}

function getOrderAmount(order: { financialStatus: string | null; totalPrice: Prisma.Decimal }) {
  return isPrepaid(order.financialStatus) ? "0" : order.totalPrice.toString();
}

function getOrderReference(order: { name: string | null; orderNumber: string | null; shopifyOrderId: string }) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

function getFirstBarcode(
  lineItems: Array<{ productItem: { barcode: string | null } }>
) {
  return lineItems.find((item) => item.productItem.barcode)?.productItem.barcode ?? "";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireFalconExportAuth(permissionKey: "fulfillment.falcon_upload.read" | "fulfillment.falcon_upload.export") {
  const auth = await requireAnyPermission([permissionKey]);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }),
    };
  }

  return { ok: true as const, companyId };
}

async function getCitypakWaybillRows(
  companyId: string,
  dispatchDate: NonNullable<ReturnType<typeof parseDispatchDate>>
) {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      dispatchedAt: {
        gte: dispatchDate.from,
        lte: dispatchDate.to,
      },
      dispatchedByCourierServiceId: { not: null },
    },
    orderBy: [{ dispatchedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      financialStatus: true,
      totalPrice: true,
      customerEmail: true,
      customerPhone: true,
      shippingAddress: true,
      billingAddress: true,
      rawPayload: true,
      companyLocation: {
        select: {
          name: true,
          shortName: true,
          locationReference: true,
          manualInvoicePrefix: true,
        },
      },
      dispatchedByCourierService: { select: { name: true } },
      lineItems: {
        select: {
          productItem: {
            select: {
              productTitle: true,
              variantTitle: true,
              sku: true,
              barcode: true,
            },
          },
        },
      },
    },
  });

  const allRows: (FalconWaybillRow & { courierName: string })[] = orders.map((order) => {
    const shippingAddress = order.shippingAddress;
    const reference = getOrderReference(order);
    const brand = resolveFalconCompanyGroup();
    const locationReference = order.companyLocation.locationReference ?? "";
    const manualInvoicePrefix = order.companyLocation.manualInvoicePrefix ?? "";
    const exportGroupKey = resolveFalconExportGroupKey({
      reference,
      shopdropRef: reference,
      locationReference,
      manualInvoicePrefix,
      locationName:
        locationReference ||
        order.companyLocation.shortName ||
        order.companyLocation.name,
    });
    const locationName =
      locationReference ||
      order.companyLocation.shortName ||
      order.companyLocation.name;
    const receiverContact =
      order.customerPhone ??
      getAddressField(shippingAddress, "phone") ??
      getAddressField(order.billingAddress, "phone");

    return {
      orderId: order.id,
      exportGroupKey,
      locationReference,
      manualInvoicePrefix,
      locationName,
      receiverName: resolveOrderCustomerName({
        shippingAddress,
        billingAddress: order.billingAddress,
        rawPayload: order.rawPayload,
      }),
      receiverAddress1: getAddressField(shippingAddress, "address1"),
      receiverAddress2: getAddressField(shippingAddress, "address2"),
      receiverCity: getAddressField(shippingAddress, "city"),
      receiverContact,
      pieces: "1",
      weightKg: "",
      weightG: "500",
      reference,
      amount: getOrderAmount(order),
      itemName: brand.itemName,
      shortName: order.companyLocation.shortName ?? "",
      shopdropRef: reference,
      waybillNo: "",
      barcode: getFirstBarcode(order.lineItems),
      customerNote: "",
      courierName: order.dispatchedByCourierService?.name ?? "",
    };
  });

  const waybillRows = allRows.filter((row) => isCitypakCourier(row.courierName));
  return waybillRows;
}

export async function GET(request: NextRequest) {
  const auth = await requireFalconExportAuth("fulfillment.falcon_upload.read");
  if (!auth.ok) return auth.response;

  const dispatchDate = parseDispatchDate(request.nextUrl.searchParams.get("dispatchDate"));
  if (!dispatchDate) {
    return NextResponse.json({ error: "Select a valid dispatch date." }, { status: 400 });
  }

  const waybillRows = await getCitypakWaybillRows(auth.companyId, dispatchDate);
  const grouped = buildGroupedFalconUploadZip(waybillRows, dispatchDate.label);

  return NextResponse.json({
    totalRows: waybillRows.length,
    groupCount: grouped.groups.length,
    groups: grouped.groups.map(({ prefix, rowCount }) => ({ prefix, rowCount })),
    orders: waybillRows.map((row) => ({
      id: row.orderId,
      reference: row.reference,
      receiverName: row.receiverName,
      receiverCity: row.receiverCity,
      receiverContact: row.receiverContact,
      amount: row.amount,
      orderPrefix: row.exportGroupKey ?? resolveFalconExportGroupKey(row),
      itemName: row.itemName,
      courierName: row.courierName,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireFalconExportAuth("fulfillment.falcon_upload.export");
  if (!auth.ok) return auth.response;

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dispatchDate = parseDispatchDate(payload.dispatchDate);
  if (!dispatchDate) {
    return NextResponse.json({ error: "Select a valid dispatch date." }, { status: 400 });
  }

  const waybillRows = await getCitypakWaybillRows(auth.companyId, dispatchDate);
  const selectedOrderIds = Array.isArray(payload.orderIds)
    ? payload.orderIds.filter((value): value is string => typeof value === "string")
    : [];
  const selectedOrderIdSet = new Set(selectedOrderIds);
  const exportRows =
    selectedOrderIdSet.size > 0
      ? waybillRows.filter((row) => row.orderId && selectedOrderIdSet.has(row.orderId))
      : [];
  const result = buildGroupedFalconUploadZip(exportRows, dispatchDate.label);

  if (result.totalRows === 0) {
    return NextResponse.json(
      {
        error: selectedOrderIdSet.size > 0
          ? "Selected orders were not found in City Pack dispatches for this date."
          : "Select at least one City Pack order to export.",
        totalRows: 0,
        groupCount: 0,
      },
      { status: 422 }
    );
  }

  const fileName = `falcon-upload-${dispatchDate.label}.zip`;
  const body = new ArrayBuffer(result.buffer.byteLength);
  new Uint8Array(body).set(result.buffer);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Total-Rows": String(result.totalRows),
      "X-Group-Count": String(result.groups.length),
    },
  });
}
