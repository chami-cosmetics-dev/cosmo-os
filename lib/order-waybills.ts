import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

import { resolveSourcePrimaryOrderRef } from "@/lib/fulfillment-order-reference";
import type {
  CitypakApiWaybillBatchRow,
  CitypakApiWaybillHistoryRow,
  WaybillLookupPageData,
  WaybillPendingRow,
  WaybillRematchSummary,
  WaybillUploadHistoryRow,
} from "@/lib/page-data/waybill-lookup-types";
import { CITYPAK_API_BATCH_FILE_TYPE, CITYPAK_WAYBILL_SOURCE } from "@/lib/citypak-api";
import { prisma } from "@/lib/prisma";

/** Default batch size for interactive rematch (button / optional rematch=1). */
export const WAYBILL_REMATCH_DEFAULT_LIMIT = 50;
/** Hard cap for a single rematch run (API body may request up to this). */
export const WAYBILL_REMATCH_MAX_LIMIT = 500;
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
  rawPayload?: Record<string, unknown> | null;
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
  options?: { page?: number; limit?: number }
): Promise<{ items: WaybillUploadHistoryRow[]; total: number }> {
  const page = Math.max(options?.page ?? 1, 1);
  const limit = Math.min(Math.max(options?.limit ?? WAYBILL_UPLOAD_HISTORY_TAKE, 1), 100);
  const offset = (page - 1) * limit;

  const countRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "WaybillUpload" wu
      WHERE wu."companyId" = ${companyId}
        AND wu."fileType" <> ${CITYPAK_API_BATCH_FILE_TYPE}
    `
  );
  const total = Number(countRows[0]?.total ?? 0);

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
        AND wu."fileType" <> ${CITYPAK_API_BATCH_FILE_TYPE}
      ORDER BY wu."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
  );

  const items = rows.map((row) => ({
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

  return { items, total };
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
    WAYBILL_REMATCH_MAX_LIMIT
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

/**
 * Delete an upload history row and any waybills still linked to that upload.
 * Waybills later overwritten by a newer file (different uploadId) are left intact.
 */
export async function deleteWaybillUpload(input: {
  companyId: string;
  uploadId: string;
}): Promise<{ ok: true; deletedWaybills: number; fileName: string } | { ok: false; error: string }> {
  const uploads = await prisma.$queryRaw<Array<{ id: string; fileName: string }>>(
    Prisma.sql`
      SELECT "id", "fileName"
      FROM "WaybillUpload"
      WHERE "id" = ${input.uploadId}
        AND "companyId" = ${input.companyId}
      LIMIT 1
    `
  );
  const upload = uploads[0];
  if (!upload) {
    return { ok: false, error: "Upload not found." };
  }

  const deleted = await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "OrderWaybill"
      WHERE "companyId" = ${input.companyId}
        AND "uploadId" = ${input.uploadId}
    `
  );

  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "WaybillUpload"
      WHERE "id" = ${input.uploadId}
        AND "companyId" = ${input.companyId}
    `
  );

  return {
    ok: true,
    deletedWaybills: Number(deleted),
    fileName: upload.fileName,
  };
}

export async function createCitypakApiDispatchBatch(input: {
  companyId: string;
  uploadedById: string | null;
  plannedTotal: number;
}): Promise<string> {
  const uploadId = randomUUID();
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const fileName = `CityPak API · ${stamp}`;
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "WaybillUpload" (
        "id",
        "companyId",
        "uploadedById",
        "fileName",
        "fileType",
        "totalRows",
        "status",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${uploadId},
        ${input.companyId},
        ${input.uploadedById},
        ${fileName},
        ${CITYPAK_API_BATCH_FILE_TYPE},
        ${Math.max(input.plannedTotal, 0)},
        ${"processing"},
        ${now},
        ${now}
      )
    `
  );
  return uploadId;
}

export async function finalizeCitypakApiDispatchBatch(input: {
  companyId: string;
  uploadId: string;
  booked: number;
  falconFallback: number;
  plannedTotal: number;
  dispatchedByName?: string | null;
}): Promise<void> {
  if (input.booked <= 0) {
    await prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM "WaybillUpload"
        WHERE "id" = ${input.uploadId}
          AND "companyId" = ${input.companyId}
          AND "fileType" = ${CITYPAK_API_BATCH_FILE_TYPE}
      `
    );
    return;
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const byLabel = input.dispatchedByName?.trim()
    ? ` · by ${input.dispatchedByName.trim()}`
    : "";
  const fileName = `CityPak API · ${stamp}${byLabel} · ${input.booked} booked`;
  const summary = {
    booked: input.booked,
    falconFallback: input.falconFallback,
    plannedTotal: input.plannedTotal,
    dispatchedByName: input.dispatchedByName?.trim() || null,
  };
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "WaybillUpload"
      SET
        "fileName" = ${fileName},
        "totalRows" = ${input.plannedTotal},
        "importedRows" = ${input.booked},
        "invalidRows" = ${input.falconFallback},
        "unmatchedRows" = 0,
        "status" = ${"completed"},
        "summary" = ${JSON.stringify(summary)}::jsonb,
        "updatedAt" = ${now}
      WHERE "id" = ${input.uploadId}
        AND "companyId" = ${input.companyId}
    `
  );
}

/** Cached CityPak PDF URLs kept on OrderWaybill.rawPayload. */
const CITYPAK_PDF_CACHE_KEYS = ["waybillPdfUrl", "waybillPdfUrlA4", "waybillPdfUrl4x6"];

async function resolveCitypakWaybillIds(input: {
  companyId: string;
  waybillIds?: string[];
  batchId?: string;
  all?: boolean;
}): Promise<string[]> {
  if (input.waybillIds?.length) {
    const rows = await prisma.orderWaybill.findMany({
      where: {
        companyId: input.companyId,
        source: CITYPAK_WAYBILL_SOURCE,
        id: { in: input.waybillIds },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  if (!input.batchId && !input.all) return [];

  const rows = await prisma.orderWaybill.findMany({
    where: {
      companyId: input.companyId,
      source: CITYPAK_WAYBILL_SOURCE,
      ...(input.batchId ? { uploadId: input.batchId } : {}),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Drop cached waybill PDFs so the next print pulls a fresh copy from CityPak.
 * History rows and tracking numbers are kept.
 */
export async function clearCitypakWaybillPdfCache(input: {
  companyId: string;
  waybillIds?: string[];
  batchId?: string;
  all?: boolean;
}): Promise<number> {
  const ids = await resolveCitypakWaybillIds(input);
  if (ids.length === 0) return 0;

  const rows = await prisma.orderWaybill.findMany({
    where: { id: { in: ids }, companyId: input.companyId },
    select: { id: true, rawPayload: true },
  });

  let cleared = 0;
  for (const row of rows) {
    const payload = parseRawPayload(row.rawPayload);
    if (!payload) continue;
    const next = { ...payload };
    let changed = false;
    for (const key of CITYPAK_PDF_CACHE_KEYS) {
      if (key in next) {
        delete next[key];
        changed = true;
      }
    }
    if (!changed) continue;
    await prisma.orderWaybill.update({
      where: { id: row.id },
      data: { rawPayload: next as Prisma.InputJsonValue },
    });
    cleared += 1;
  }

  return cleared;
}

/**
 * Hide CityPak API waybills from history UI without deleting them.
 * Orders stay API-booked (still excluded from Falcon Upload). Trace stays for date-range lookup.
 */
export async function archiveCitypakApiWaybills(input: {
  companyId: string;
  waybillIds?: string[];
  batchId?: string;
  all?: boolean;
}): Promise<{ archivedWaybills: number; archivedBatches: number }> {
  const ids = await resolveCitypakWaybillIds(input);
  const nowIso = new Date().toISOString();
  let archivedWaybills = 0;

  if (ids.length > 0) {
    const rows = await prisma.orderWaybill.findMany({
      where: { id: { in: ids }, companyId: input.companyId },
      select: { id: true, rawPayload: true },
    });
    for (const row of rows) {
      const payload = parseRawPayload(row.rawPayload) ?? {};
      if (payload.historyArchived === true) continue;
      await prisma.orderWaybill.update({
        where: { id: row.id },
        data: {
          rawPayload: {
            ...payload,
            historyArchived: true,
            historyArchivedAt: nowIso,
          } as Prisma.InputJsonValue,
        },
      });
      archivedWaybills += 1;
    }
  }

  let archivedBatches = 0;
  if (input.batchId && !input.batchId.startsWith("legacy-")) {
    archivedBatches = Number(
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE "WaybillUpload"
          SET "status" = ${"archived"}, "updatedAt" = ${new Date()}
          WHERE "id" = ${input.batchId}
            AND "companyId" = ${input.companyId}
            AND "fileType" = ${CITYPAK_API_BATCH_FILE_TYPE}
            AND "status" = ${"completed"}
        `
      )
    );
  } else if (input.all) {
    archivedBatches = Number(
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE "WaybillUpload"
          SET "status" = ${"archived"}, "updatedAt" = ${new Date()}
          WHERE "companyId" = ${input.companyId}
            AND "fileType" = ${CITYPAK_API_BATCH_FILE_TYPE}
            AND "status" = ${"completed"}
        `
      )
    );
  } else if (input.waybillIds?.length) {
    // Archive empty completed batches after their waybills were hidden.
    const emptyBatches = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT wu."id"
        FROM "WaybillUpload" wu
        WHERE wu."companyId" = ${input.companyId}
          AND wu."fileType" = ${CITYPAK_API_BATCH_FILE_TYPE}
          AND wu."status" = ${"completed"}
          AND NOT EXISTS (
            SELECT 1
            FROM "OrderWaybill" ow
            WHERE ow."uploadId" = wu."id"
              AND COALESCE((ow."rawPayload"->>'historyArchived')::boolean, false) = false
          )
      `
    );
    if (emptyBatches.length > 0) {
      archivedBatches = Number(
        await prisma.$executeRaw(
          Prisma.sql`
            UPDATE "WaybillUpload"
            SET "status" = ${"archived"}, "updatedAt" = ${new Date()}
            WHERE "companyId" = ${input.companyId}
              AND "fileType" = ${CITYPAK_API_BATCH_FILE_TYPE}
              AND "id" IN (${Prisma.join(emptyBatches.map((row) => row.id))})
          `
        )
      );
    }
  }

  return { archivedWaybills, archivedBatches };
}

/** @deprecated Prefer archiveCitypakApiWaybills — hard delete removed so traces stay. */
export async function deleteCitypakApiWaybills(input: {
  companyId: string;
  waybillIds?: string[];
  batchId?: string;
  all?: boolean;
}): Promise<{ deletedWaybills: number; deletedBatches: number }> {
  const result = await archiveCitypakApiWaybills(input);
  return { deletedWaybills: result.archivedWaybills, deletedBatches: result.archivedBatches };
}

function mapCitypakApiWaybillRow(row: {
  id: string;
  waybillNo: string;
  invoiceNumber: string;
  courierName: string | null;
  orderId: string | null;
  rawPayload: Prisma.JsonValue | null;
  createdAt: Date;
  order: {
    id: string;
    name: string | null;
    orderNumber: string | null;
    shopifyOrderId: string | null;
    erpnextInvoiceId: string | null;
    sourceName: string | null;
  } | null;
}): CitypakApiWaybillHistoryRow {
  const payload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const manual = payload?.manual === true;
  const orderLabel = row.order
    ? resolveSourcePrimaryOrderRef({
        id: row.order.id,
        name: row.order.name,
        orderNumber: row.order.orderNumber,
        shopifyOrderId: row.order.shopifyOrderId,
        erpnextInvoiceId: row.order.erpnextInvoiceId,
        sourceName: row.order.sourceName,
      })
    : null;
  return {
    id: row.id,
    waybillNo: row.waybillNo,
    invoiceNumber: row.invoiceNumber,
    courierName: row.courierName,
    orderId: row.orderId,
    orderLabel,
    manual,
    createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
  };
}

export async function listCitypakApiWaybillBatches(
  companyId: string,
  options?: {
    take?: number;
    from?: Date | null;
    to?: Date | null;
    includeArchived?: boolean;
  }
): Promise<CitypakApiWaybillBatchRow[]> {
  const take = Math.min(Math.max(options?.take ?? 40, 1), 100);
  const from = options?.from ?? null;
  const to = options?.to ?? null;
  const includeArchived = options?.includeArchived === true;
  const statusFilter = includeArchived
    ? Prisma.sql`AND wu."status" IN (${"completed"}, ${"archived"})`
    : Prisma.sql`AND wu."status" = ${"completed"}`;
  const dateFilter =
    from && to
      ? Prisma.sql`AND wu."createdAt" >= ${from} AND wu."createdAt" <= ${to}`
      : from
        ? Prisma.sql`AND wu."createdAt" >= ${from}`
        : to
          ? Prisma.sql`AND wu."createdAt" <= ${to}`
          : Prisma.empty;

  const batches = await prisma.$queryRaw<
    Array<{
      id: string;
      fileName: string;
      importedRows: number;
      createdAt: Date;
      summary: Prisma.JsonValue | null;
      uploadedById: string | null;
      uploadedByName: string | null;
      uploadedByEmail: string | null;
      status: string;
    }>
  >(
    Prisma.sql`
      SELECT
        wu."id",
        wu."fileName",
        wu."importedRows",
        wu."createdAt",
        wu."summary",
        wu."uploadedById",
        wu."status",
        u."name" AS "uploadedByName",
        u."email" AS "uploadedByEmail"
      FROM "WaybillUpload" wu
      LEFT JOIN "User" u ON u."id" = wu."uploadedById"
      WHERE wu."companyId" = ${companyId}
        AND wu."fileType" = ${CITYPAK_API_BATCH_FILE_TYPE}
        ${statusFilter}
        ${dateFilter}
      ORDER BY wu."createdAt" DESC
      LIMIT ${take}
    `
  );

  const batchIds = batches.map((batch) => batch.id);
  const waybills =
    batchIds.length === 0
      ? []
      : await prisma.orderWaybill.findMany({
          where: {
            companyId,
            source: CITYPAK_WAYBILL_SOURCE,
            uploadId: { in: batchIds },
            ...(from || to
              ? {
                  createdAt: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            uploadId: true,
            waybillNo: true,
            invoiceNumber: true,
            courierName: true,
            orderId: true,
            rawPayload: true,
            createdAt: true,
            order: {
              select: {
                id: true,
                name: true,
                orderNumber: true,
                shopifyOrderId: true,
                erpnextInvoiceId: true,
                sourceName: true,
              },
            },
          },
        });

  const byUpload = new Map<string, CitypakApiWaybillHistoryRow[]>();
  for (const row of waybills) {
    if (!row.uploadId) continue;
    const payload = parseRawPayload(row.rawPayload);
    if (!includeArchived && payload?.historyArchived === true) continue;
    const mapped = mapCitypakApiWaybillRow(row);
    const list = byUpload.get(row.uploadId) ?? [];
    list.push(mapped);
    byUpload.set(row.uploadId, list);
  }

  const result: CitypakApiWaybillBatchRow[] = batches.map((batch) => {
    const batchWaybills = byUpload.get(batch.id) ?? [];
    const summary =
      batch.summary && typeof batch.summary === "object" && !Array.isArray(batch.summary)
        ? (batch.summary as Record<string, unknown>)
        : null;
    const summaryName =
      typeof summary?.dispatchedByName === "string" ? summary.dispatchedByName.trim() : "";
    const name = batch.uploadedByName?.trim() || summaryName || null;
    const email = batch.uploadedByEmail?.trim() || null;
    return {
      id: batch.id,
      label: batch.status === "archived" ? `${batch.fileName} (cleared)` : batch.fileName,
      bookedCount: batchWaybills.length || batch.importedRows,
      createdAt: toIso(batch.createdAt) ?? new Date().toISOString(),
      uploadedBy:
        batch.uploadedById || name || email
          ? {
              id: batch.uploadedById ?? "",
              name,
              email,
            }
          : null,
      waybills: batchWaybills,
    };
  });

  // Older API waybills saved before batching — group by calendar day so history still usable.
  const orphans = await prisma.orderWaybill.findMany({
    where: {
      companyId,
      source: CITYPAK_WAYBILL_SOURCE,
      uploadId: null,
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      waybillNo: true,
      invoiceNumber: true,
      courierName: true,
      orderId: true,
      rawPayload: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
          erpnextInvoiceId: true,
          sourceName: true,
        },
      },
    },
  });

  if (orphans.length > 0) {
    const byDay = new Map<string, CitypakApiWaybillHistoryRow[]>();
    for (const row of orphans) {
      const payload = parseRawPayload(row.rawPayload);
      if (!includeArchived && payload?.historyArchived === true) continue;
      const day = (toIso(row.createdAt) ?? "").slice(0, 10) || "unknown";
      const list = byDay.get(day) ?? [];
      list.push(mapCitypakApiWaybillRow(row));
      byDay.set(day, list);
    }
    for (const [day, dayWaybills] of byDay) {
      if (dayWaybills.length === 0) continue;
      result.push({
        id: `legacy-${day}`,
        label: `CityPak API · ${day} · ${dayWaybills.length} booked (before batch history)`,
        bookedCount: dayWaybills.length,
        createdAt: dayWaybills[0]?.createdAt ?? new Date().toISOString(),
        uploadedBy: null,
        waybills: dayWaybills,
      });
    }
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return result.slice(0, take);
}

export async function getWaybillLookupPageData(input: {
  companyId: string;
  page: number;
  limit: number;
  uploadsPage?: number;
  uploadsLimit?: number;
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

  const uploadsPage = Math.max(input.uploadsPage ?? 1, 1);
  const uploadsLimit = input.uploadsLimit ?? 20;

  const [pendingResult, uploadsResult] = await Promise.all([
    listPendingWaybills(input.companyId, { page: input.page, limit: input.limit }),
    listWaybillUploads(input.companyId, { page: uploadsPage, limit: uploadsLimit }),
  ]);

  return {
    pending: pendingResult.items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total: pendingResult.total,
    },
    uploads: uploadsResult.items,
    uploadsPagination: {
      page: uploadsPage,
      limit: uploadsLimit,
      total: uploadsResult.total,
    },
    rematch: rematchSummary,
    canImport: input.canImport,
  };
}
