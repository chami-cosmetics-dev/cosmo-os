import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

import { prisma } from "@/lib/prisma";

export type OrderWaybillLookupResult = {
  order: {
    id: string;
    name: string | null;
    orderNumber: string | null;
    shopifyOrderId: string;
    customerEmail: string | null;
    customerPhone: string | null;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    fulfillmentStage: string;
    dispatchedAt: string | null;
    deliveryCompleteAt: string | null;
    invoiceCompleteAt: string | null;
    courierName: string | null;
    locationName: string;
  } | null;
  waybills: Array<{
    id: string;
    invoiceNumber: string;
    waybillNo: string;
    courierName: string | null;
    source: string;
    rawPayload: Record<string, unknown> | null;
    uploadedAt: string | null;
    uploadFileName: string | null;
    createdAt: string;
  }>;
};

export function normalizeInvoiceLookup(value: string) {
  return value.trim().replace(/^#+/, "").replace(/\s+/g, "");
}

function invoiceCandidates(value: string) {
  const normalized = normalizeInvoiceLookup(value);
  return Array.from(new Set([value.trim(), normalized, `#${normalized}`].filter(Boolean)));
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function findOrderWaybillsByInvoice(
  companyId: string,
  invoiceInput: string
): Promise<OrderWaybillLookupResult> {
  const candidates = invoiceCandidates(invoiceInput);
  if (candidates.length === 0) {
    return { order: null, waybills: [] };
  }

  const orders = await prisma.$queryRaw<Array<{
    id: string;
    name: string | null;
    orderNumber: string | null;
    shopifyOrderId: string;
    customerEmail: string | null;
    customerPhone: string | null;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    fulfillmentStage: string;
    dispatchedAt: Date | null;
    deliveryCompleteAt: Date | null;
    invoiceCompleteAt: Date | null;
    courierName: string | null;
    locationName: string;
  }>>(
    Prisma.sql`
      SELECT
        o."id",
        o."name",
        o."orderNumber",
        o."shopifyOrderId",
        o."customerEmail",
        o."customerPhone",
        o."financialStatus",
        o."fulfillmentStatus",
        o."fulfillmentStage"::text AS "fulfillmentStage",
        o."dispatchedAt",
        o."deliveryCompleteAt",
        o."invoiceCompleteAt",
        cs."name" AS "courierName",
        cl."name" AS "locationName"
      FROM "Order" o
      JOIN "CompanyLocation" cl ON cl."id" = o."companyLocationId"
      LEFT JOIN "CourierService" cs ON cs."id" = o."dispatchedByCourierServiceId"
      WHERE o."companyId" = ${companyId}
        AND (
          o."name" IN (${Prisma.join(candidates)})
          OR o."orderNumber" IN (${Prisma.join(candidates)})
          OR o."shopifyOrderId" IN (${Prisma.join(candidates)})
        )
      ORDER BY o."createdAt" DESC
      LIMIT 1
    `
  );

  const order = orders[0] ?? null;
  const normalized = normalizeInvoiceLookup(invoiceInput);

  const waybills = await prisma.$queryRaw<Array<{
    id: string;
    invoiceNumber: string;
    waybillNo: string;
    courierName: string | null;
    source: string;
    rawPayload: Prisma.JsonValue | null;
    uploadedAt: Date | null;
    uploadFileName: string | null;
    createdAt: Date;
  }>>(
    Prisma.sql`
      SELECT
        ow."id",
        ow."invoiceNumber",
        ow."waybillNo",
        ow."courierName",
        ow."source",
        ow."rawPayload",
        ow."uploadedAt",
        wu."fileName" AS "uploadFileName",
        ow."createdAt"
      FROM "OrderWaybill" ow
      LEFT JOIN "WaybillUpload" wu ON wu."id" = ow."uploadId"
      WHERE ow."companyId" = ${companyId}
        AND (
          ${order?.id ?? null}::text IS NOT NULL AND ow."orderId" = ${order?.id ?? null}
          OR ow."invoiceNumber" IN (${Prisma.join(candidates)})
          OR regexp_replace(ow."invoiceNumber", '^#', '') = ${normalized}
          OR ow."waybillNo" IN (${Prisma.join(candidates)})
          OR regexp_replace(ow."waybillNo", '^#', '') = ${normalized}
        )
      ORDER BY ow."createdAt" DESC
      LIMIT 20
    `
  );

  return {
    order: order
      ? {
          ...order,
          dispatchedAt: toIso(order.dispatchedAt),
          deliveryCompleteAt: toIso(order.deliveryCompleteAt),
          invoiceCompleteAt: toIso(order.invoiceCompleteAt),
        }
      : null,
    waybills: waybills.map((waybill) => {
      const rawPayload =
        waybill.rawPayload && typeof waybill.rawPayload === "object" && !Array.isArray(waybill.rawPayload)
          ? (waybill.rawPayload as Record<string, unknown>)
          : null;

      return {
        ...waybill,
        rawPayload,
        uploadedAt: toIso(waybill.uploadedAt),
        createdAt: toIso(waybill.createdAt) ?? new Date().toISOString(),
      };
    }),
  };
}

export async function saveOrderWaybill(input: {
  companyId: string;
  orderId?: string | null;
  invoiceNumber: string;
  waybillNo: string;
  courierName?: string | null;
  source?: string;
  uploadId?: string | null;
  rawPayload?: Record<string, string> | null;
}) {
  const now = new Date();
  const rawPayloadSql = input.rawPayload
    ? Prisma.sql`${JSON.stringify(input.rawPayload)}::jsonb`
    : Prisma.sql`NULL`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      INSERT INTO "OrderWaybill" (
        "id",
        "companyId",
        "orderId",
        "uploadId",
        "invoiceNumber",
        "waybillNo",
        "courierName",
        "source",
        "rawPayload",
        "uploadedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${input.companyId},
        ${input.orderId},
        ${input.uploadId ?? null},
        ${input.invoiceNumber},
        ${input.waybillNo},
        ${input.courierName ?? null},
        ${input.source ?? "manual"},
        ${rawPayloadSql},
        ${now},
        ${now},
        ${now}
      )
      ON CONFLICT ("companyId", "waybillNo")
      DO UPDATE SET
        "orderId" = EXCLUDED."orderId",
        "uploadId" = EXCLUDED."uploadId",
        "invoiceNumber" = EXCLUDED."invoiceNumber",
        "courierName" = EXCLUDED."courierName",
        "source" = EXCLUDED."source",
        "rawPayload" = EXCLUDED."rawPayload",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id"
    `
  );

  return rows[0]?.id ?? null;
}
