import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

import { resolveSourcePrimaryOrderRef } from "@/lib/fulfillment-order-reference";
import type {
  WaybillLookupPageData,
  WaybillPendingRow,
  WaybillRematchSummary,
  WaybillUploadHistoryRow,
} from "@/lib/page-data/waybill-lookup-types";
import { prisma } from "@/lib/prisma";

export const WAYBILL_REMATCH_DEFAULT_LIMIT = 500;
export const WAYBILL_UPLOAD_HISTORY_TAKE = 50;

export type OrderWaybillLookupResult = {
  order: {
    id: string;
    name: string | null;
    orderNumber: string | null;
    shopifyOrderId: string;
    erpnextInvoiceId: string | null;
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

export function invoiceCandidates(value: string) {
  const normalized = normalizeInvoiceLookup(value);
  return Array.from(new Set([value.trim(), normalized, `#${normalized}`].filter(Boolean)));
}

export function isPendingWaybill(input: {
  orderId: string | null | undefined;
  deliveryCompleteAt: Date | string | null | undefined;
}) {
  if (!input.orderId) return true;
  return input.deliveryCompleteAt == null;
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseRawPayload(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

type OrderMatchRow = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  erpnextInvoiceId: string | null;
  sourceName: string | null;
  deliveryCompleteAt: Date | null;
};

async function findOrderByInvoiceRef(
  companyId: string,
  invoiceInput: string
): Promise<OrderMatchRow | null> {
  const candidates = invoiceCandidates(invoiceInput);
  if (candidates.length === 0) return null;

  const orders = await prisma.$queryRaw<OrderMatchRow[]>(
    Prisma.sql`
      SELECT
        o."id",
        o."name",
        o."orderNumber",
        o."shopifyOrderId",
        o."erpnextInvoiceId",
        o."sourceName",
        o."deliveryCompleteAt"
      FROM "Order" o
      WHERE o."companyId" = ${companyId}
        AND (
          o."name" IN (${Prisma.join(candidates)})
          OR o."orderNumber" IN (${Prisma.join(candidates)})
          OR o."shopifyOrderId" IN (${Prisma.join(candidates)})
          OR o."erpnextInvoiceId" IN (${Prisma.join(candidates)})
        )
      ORDER BY o."createdAt" DESC
      LIMIT 1
    `
  );

  return orders[0] ?? null;
}

/** Resolve OS order id for a courier invoice / order reference, or null if unmatched. */
export async function findOrderIdByInvoiceRef(
  companyId: string,
  invoiceInput: string
): Promise<string | null> {
  const order = await findOrderByInvoiceRef(companyId, invoiceInput);
  return order?.id ?? null;
}

export async function findOrderWaybillsByInvoice(
  companyId: string,
  invoiceInput: string
): Promise<OrderWaybillLookupResult> {
  const candidates = invoiceCandidates(invoiceInput);
  if (candidates.length === 0) {
    return { order: null, waybills: [] };
  }

  const orders = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string | null;
      orderNumber: string | null;
      shopifyOrderId: string;
      erpnextInvoiceId: string | null;
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
    }>
  >(
    Prisma.sql`
      SELECT
        o."id",
        o."name",
        o."orderNumber",
        o."shopifyOrderId",
        o."erpnextInvoiceId",
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
          OR o."erpnextInvoiceId" IN (${Prisma.join(candidates)})
        )
      ORDER BY o."createdAt" DESC
      LIMIT 1
    `
  );

  const order = orders[0] ?? null;
  const normalized = normalizeInvoiceLookup(invoiceInput);

  const waybills = await prisma.$queryRaw<
    Array<{
      id: string;
      invoiceNumber: string;
      waybillNo: string;
      courierName: string | null;
      source: string;
      rawPayload: Prisma.JsonValue | null;
      uploadedAt: Date | null;
      uploadFileName: string | null;
      createdAt: Date;
    }>
  >(
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
    waybills: waybills.map((waybill) => ({
      ...waybill,
      rawPayload: parseRawPayload(waybill.rawPayload),
      uploadedAt: toIso(waybill.uploadedAt),
      createdAt: toIso(waybill.createdAt) ?? new Date().toISOString(),
    })),
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
  // Cumulative multi-upload: upsert by waybill number only — never deletes other company rows.
  // Preserve existing orderId when a re-import cannot resolve a match (COALESCE).
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
        ${input.orderId ?? null},
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
        "orderId" = COALESCE(EXCLUDED."orderId", "OrderWaybill"."orderId"),
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

export async function listWaybillUploads(
  companyId: string,
  options?: { take?: number }
): Promise<WaybillUploadHistoryRow[]> {
  const take = Math.min(Math.max(options?.take ?? WAYBILL_UPLOAD_HISTORY_TAKE, 1), 100);

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      fileName: string;
      fileType: string;
      totalRows: number;
      importedRows: number;
      invalidRows: number;
      unmatchedRows: number;
      status: string;
      createdAt: Date;
      uploadedById: string | null;
      uploadedByName: string | null;
      uploadedByEmail: string | null;
    }>
  >(
    Prisma.sql`
      SELECT
        wu."id",
        wu."fileName",
        wu."fileType",
        wu."totalRows",
        wu."importedRows",
        wu."invalidRows",
        wu."unmatchedRows",
        wu."status",
        wu."createdAt",
        wu."uploadedById",
        u."name" AS "uploadedByName",
        u."email" AS "uploadedByEmail"
      FROM "WaybillUpload" wu
      LEFT JOIN "User" u ON u."id" = wu."uploadedById"
      WHERE wu."companyId" = ${companyId}
      ORDER BY wu."createdAt" DESC
      LIMIT ${take}
    `
  );

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    fileType: row.fileType,
    totalRows: row.totalRows,
    importedRows: row.importedRows,
    invalidRows: row.invalidRows,
    unmatchedRows: row.unmatchedRows,
    status: row.status,
    createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
    uploadedBy: row.uploadedById
      ? {
          id: row.uploadedById,
          name: row.uploadedByName,
          email: row.uploadedByEmail,
        }
      : null,
  }));
}

export async function listPendingWaybills(
  companyId: string,
  options: { page: number; limit: number }
): Promise<{ items: WaybillPendingRow[]; total: number }> {
  const page = Math.max(options.page, 1);
  const limit = Math.min(Math.max(options.limit, 1), 100);
  const offset = (page - 1) * limit;

  const countRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "OrderWaybill" ow
      LEFT JOIN "Order" o ON o."id" = ow."orderId"
      WHERE ow."companyId" = ${companyId}
        AND (ow."orderId" IS NULL OR o."deliveryCompleteAt" IS NULL)
    `
  );
  const total = Number(countRows[0]?.total ?? 0);

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      waybillNo: string;
      invoiceNumber: string;
      courierName: string | null;
      source: string;
      rawPayload: Prisma.JsonValue | null;
      uploadedAt: Date | null;
      uploadFileName: string | null;
      orderId: string | null;
      orderName: string | null;
      orderNumber: string | null;
      shopifyOrderId: string | null;
      erpnextInvoiceId: string | null;
      sourceName: string | null;
      deliveryCompleteAt: Date | null;
    }>
  >(
    Prisma.sql`
      SELECT
        ow."id",
        ow."waybillNo",
        ow."invoiceNumber",
        ow."courierName",
        ow."source",
        ow."rawPayload",
        ow."uploadedAt",
        wu."fileName" AS "uploadFileName",
        ow."orderId",
        o."name" AS "orderName",
        o."orderNumber",
        o."shopifyOrderId",
        o."erpnextInvoiceId",
        o."sourceName",
        o."deliveryCompleteAt"
      FROM "OrderWaybill" ow
      LEFT JOIN "Order" o ON o."id" = ow."orderId"
      LEFT JOIN "WaybillUpload" wu ON wu."id" = ow."uploadId"
      WHERE ow."companyId" = ${companyId}
        AND (ow."orderId" IS NULL OR o."deliveryCompleteAt" IS NULL)
      ORDER BY ow."uploadedAt" DESC NULLS LAST, ow."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
  );

  const items: WaybillPendingRow[] = rows.map((row) => {
    const matched = Boolean(row.orderId);
    return {
      id: row.id,
      waybillNo: row.waybillNo,
      invoiceNumber: row.invoiceNumber,
      courierName: row.courierName,
      matchStatus: matched ? "matched" : "unmatched",
      order:
        matched && row.orderId
          ? {
              id: row.orderId,
              displayId: resolveSourcePrimaryOrderRef({
                id: row.orderId,
                name: row.orderName,
                orderNumber: row.orderNumber,
                shopifyOrderId: row.shopifyOrderId,
                erpnextInvoiceId: row.erpnextInvoiceId,
                sourceName: row.sourceName,
              }),
              deliveryCompleteAt: toIso(row.deliveryCompleteAt),
              name: row.orderName,
              orderNumber: row.orderNumber,
              shopifyOrderId: row.shopifyOrderId,
              erpnextInvoiceId: row.erpnextInvoiceId,
              sourceName: row.sourceName,
            }
          : null,
      uploadFileName: row.uploadFileName,
      uploadedAt: toIso(row.uploadedAt),
      rawPayload: parseRawPayload(row.rawPayload),
      source: row.source,
    };
  });

  return { items, total };
}

export async function rematchUnmatchedWaybills(
  companyId: string,
  options?: { limit?: number }
): Promise<WaybillRematchSummary> {
  const limit = Math.min(
    Math.max(options?.limit ?? WAYBILL_REMATCH_DEFAULT_LIMIT, 1),
    WAYBILL_REMATCH_DEFAULT_LIMIT
  );

  const unmatched = await prisma.$queryRaw<
    Array<{ id: string; invoiceNumber: string; orderId: string | null }>
  >(
    Prisma.sql`
      SELECT ow."id", ow."invoiceNumber", ow."orderId"
      FROM "OrderWaybill" ow
      WHERE ow."companyId" = ${companyId}
        AND ow."orderId" IS NULL
      ORDER BY ow."createdAt" ASC
      LIMIT ${limit}
    `
  );

  let matched = 0;
  for (const row of unmatched) {
    // Already linked rows are never selected; keep guard for callers/tests.
    if (row.orderId) continue;

    const orderId = await findOrderIdByInvoiceRef(companyId, row.invoiceNumber);
    if (!orderId) continue;

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "OrderWaybill"
        SET
          "orderId" = ${orderId},
          "updatedAt" = ${new Date()}
        WHERE "id" = ${row.id}
          AND "companyId" = ${companyId}
          AND "orderId" IS NULL
      `
    );
    matched += 1;
  }

  return { attempted: unmatched.length, matched };
}

export async function getWaybillLookupPageData(input: {
  companyId: string;
  page: number;
  limit: number;
  canImport: boolean;
  rematch?: boolean;
  rematchLimit?: number;
}): Promise<WaybillLookupPageData> {
  let rematchSummary: WaybillRematchSummary | null = null;
  if (input.rematch) {
    rematchSummary = await rematchUnmatchedWaybills(input.companyId, {
      limit: input.rematchLimit,
    });
  }

  const [pendingResult, uploads] = await Promise.all([
    listPendingWaybills(input.companyId, { page: input.page, limit: input.limit }),
    listWaybillUploads(input.companyId),
  ]);

  return {
    pending: pendingResult.items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total: pendingResult.total,
    },
    uploads,
    rematch: rematchSummary,
    canImport: input.canImport,
  };
}
