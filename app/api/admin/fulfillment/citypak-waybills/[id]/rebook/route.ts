import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import {
  CITYPAK_WAYBILL_SOURCE,
  draftCitypakShipmentFields,
  parseCitypakShipment,
  type CitypakShipmentOverride,
} from "@/lib/citypak-api";
import { updateCitypakWaybillPrintDetails } from "@/lib/citypak-dispatch";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidOrUuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MANAGE_PERMISSIONS = [
  "fulfillment.ready_dispatch.dispatch",
  "fulfillment.waybill_lookup.import",
];

const shipmentSchema = z.object({
  receiverName: z.string().trim().min(1).max(80),
  receiverAddress1: z.string().trim().min(1).max(120),
  receiverAddress2: z.string().trim().max(120).default(""),
  receiverCity: z.string().trim().min(1).max(80),
  receiverPhone: z.string().trim().min(9).max(20),
  cashOnDeliveryAmount: z.number().min(0).max(10_000_000).default(0),
});

async function authorize(id: string) {
  const auth = await requireAnyPermission(MANAGE_PERMISSIONS);
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
  const parsedId = cuidOrUuidSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false as const, response: NextResponse.json({ error: "Invalid waybill id." }, { status: 400 }) };
  }
  return { ok: true as const, companyId, userId: auth.context!.user!.id, waybillId: parsedId.data };
}

/** Current receiver details for the edit form. Tracking does not change. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;

  const waybill = await prisma.orderWaybill.findFirst({
    where: { id: auth.waybillId, companyId: auth.companyId, source: CITYPAK_WAYBILL_SOURCE },
    select: {
      waybillNo: true,
      invoiceNumber: true,
      rawPayload: true,
      order: {
        select: {
          shippingAddress: true,
          billingAddress: true,
          rawPayload: true,
          customerPhone: true,
          financialStatus: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          totalPrice: true,
        },
      },
    },
  });
  if (!waybill) {
    return NextResponse.json({ error: "CityPak waybill not found." }, { status: 404 });
  }

  const payload =
    waybill.rawPayload && typeof waybill.rawPayload === "object" && !Array.isArray(waybill.rawPayload)
      ? (waybill.rawPayload as Record<string, unknown>)
      : {};
  const stored = parseCitypakShipment(payload.shipment);

  const shipment: CitypakShipmentOverride = stored
    ? stored
    : waybill.order
      ? draftCitypakShipmentFields({
          shippingAddress: waybill.order.shippingAddress,
          billingAddress: waybill.order.billingAddress,
          rawPayload: waybill.order.rawPayload,
          customerPhone: waybill.order.customerPhone,
          financialStatus: waybill.order.financialStatus,
          paymentGatewayPrimary: waybill.order.paymentGatewayPrimary,
          paymentGatewayNames: waybill.order.paymentGatewayNames,
          totalPrice: waybill.order.totalPrice?.toString(),
        })
      : {
          receiverName: "",
          receiverAddress1: "",
          receiverAddress2: "",
          receiverCity: "",
          receiverPhone: "",
          cashOnDeliveryAmount: 0,
        };

  return NextResponse.json({
    waybillNo: waybill.waybillNo,
    reference: waybill.invoiceNumber,
    shipment,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;

  const parsed = shipmentSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the receiver details." },
      { status: 400 }
    );
  }

  const result = await updateCitypakWaybillPrintDetails({
    companyId: auth.companyId,
    waybillId: auth.waybillId,
    shipment: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await writeAuditLog({
    companyId: auth.companyId,
    actorUserId: auth.userId,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "OrderWaybill",
    entityId: auth.waybillId,
    summary: `Edited CityPak waybill print details for ${result.trackingNumber}`,
    metadata: { trackingNumber: result.trackingNumber },
  });

  return NextResponse.json({
    message: `Saved. Tracking ${result.trackingNumber} is unchanged — print to get the updated copy.`,
    trackingNumber: result.trackingNumber,
  });
}
