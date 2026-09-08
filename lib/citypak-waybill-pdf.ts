import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { PDFDocument } from "pdf-lib";

import {
  CITYPAK_DEFAULT_WAYBILL_PRINT_SIZE,
  CITYPAK_WAYBILL_SOURCE,
  downloadCitypakWaybillPdf,
  type CitypakWaybillPrintSize,
} from "@/lib/citypak-api";
import { prisma } from "@/lib/prisma";

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function pdfCacheKey(printSize: CitypakWaybillPrintSize) {
  return printSize === "4x6" ? "waybillPdfUrl4x6" : "waybillPdfUrlA4";
}

async function fetchBlobBytes(blobUrl: string): Promise<Buffer | null> {
  try {
    const blobRes = await fetch(
      blobUrl,
      process.env.BLOB_READ_WRITE_TOKEN
        ? { headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } }
        : undefined,
    );
    if (!blobRes.ok) return null;
    return Buffer.from(await blobRes.arrayBuffer());
  } catch {
    return null;
  }
}

export async function cacheCitypakWaybillPdf(input: {
  companyId: string;
  folderKey: string;
  trackingNumber: string;
  printSize: CitypakWaybillPrintSize;
  bytes: Buffer;
}): Promise<string | null> {
  try {
    const blob = await put(
      `citypak-waybills/${input.companyId}/${input.folderKey}/${input.trackingNumber}-${input.printSize}.pdf`,
      input.bytes,
      {
        access: "private",
        addRandomSuffix: true,
        contentType: "application/pdf",
      },
    );
    return blob.url;
  } catch (err) {
    console.error("[citypak-waybill-pdf] blob put failed", err);
    return null;
  }
}

export async function loadCitypakWaybillPdf(input: {
  companyId: string;
  orderId?: string;
  waybillId?: string;
  printSize?: CitypakWaybillPrintSize;
}): Promise<
  | { ok: true; bytes: Buffer; trackingNumber: string; filename: string; printSize: CitypakWaybillPrintSize }
  | { ok: false; error: string; status: number }
> {
  const printSize = input.printSize ?? CITYPAK_DEFAULT_WAYBILL_PRINT_SIZE;
  const waybill = input.waybillId
    ? await prisma.orderWaybill.findFirst({
        where: {
          id: input.waybillId,
          companyId: input.companyId,
          source: CITYPAK_WAYBILL_SOURCE,
        },
        select: { id: true, waybillNo: true, orderId: true, rawPayload: true },
      })
    : input.orderId
      ? await prisma.orderWaybill.findFirst({
          where: {
            companyId: input.companyId,
            orderId: input.orderId,
            source: CITYPAK_WAYBILL_SOURCE,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, waybillNo: true, orderId: true, rawPayload: true },
        })
      : null;

  if (!waybill) {
    return { ok: false, error: "No CityPak waybill booked for this request", status: 404 };
  }

  const payload = asRecord(waybill.rawPayload);
  const trackingNumber = waybill.waybillNo;
  const sizeSuffix = printSize === "4x6" ? "4x6" : "A4";
  const filename = `citypak-waybill-${trackingNumber}-${sizeSuffix}.pdf`;
  const cacheKey = pdfCacheKey(printSize);

  const storedUrl = readString(payload, cacheKey) || (printSize === "A4" ? readString(payload, "waybillPdfUrl") : "");
  if (storedUrl) {
    const cached = await fetchBlobBytes(storedUrl);
    if (cached) {
      return { ok: true, bytes: cached, trackingNumber, filename, printSize };
    }
  }

  const citypakOrderId = readString(payload, "citypakOrderId");
  if (!citypakOrderId) {
    return { ok: false, error: "CityPak order id missing — cannot download waybill PDF", status: 404 };
  }

  const accountDbId = readString(payload, "citypakAccountDbId");
  const accountId = readString(payload, "citypakAccountId");
  const account = accountDbId
    ? await prisma.citypakAccount.findFirst({
        where: { id: accountDbId, companyId: input.companyId },
        select: { apiToken: true },
      })
    : accountId
      ? await prisma.citypakAccount.findFirst({
          where: { companyId: input.companyId, accountId },
          select: { apiToken: true },
        })
      : null;

  if (!account?.apiToken) {
    return { ok: false, error: "CityPak API token not found for this waybill", status: 404 };
  }

  const downloaded = await downloadCitypakWaybillPdf({
    token: account.apiToken,
    citypakOrderId,
    pageSize: printSize,
  });
  if (!downloaded.ok) {
    return { ok: false, error: downloaded.error, status: downloaded.status ?? 502 };
  }

  const blobUrl = await cacheCitypakWaybillPdf({
    companyId: input.companyId,
    folderKey: waybill.orderId ?? waybill.id,
    trackingNumber,
    printSize,
    bytes: downloaded.bytes,
  });
  if (blobUrl) {
    await prisma.orderWaybill.update({
      where: { id: waybill.id },
      data: {
        rawPayload: { ...payload, [cacheKey]: blobUrl } as Prisma.InputJsonValue,
      },
    });
  }

  return { ok: true, bytes: downloaded.bytes, trackingNumber, filename, printSize };
}

export async function loadCitypakWaybillPdfForOrder(input: {
  companyId: string;
  orderId: string;
  printSize?: CitypakWaybillPrintSize;
}) {
  return loadCitypakWaybillPdf({
    companyId: input.companyId,
    orderId: input.orderId,
    printSize: input.printSize,
  });
}

/** A4 points (pdf-lib / PDF spec). */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/**
 * Merge waybill PDFs.
 * - 4x6: keep each label as its own page (Falcon thermal size)
 * - A4: place up to 4 labels per A4 sheet (2×2), matching “one A4 / 4 waybills”
 */
export async function mergeCitypakWaybillPdfs(
  parts: Buffer[],
  options?: { printSize?: CitypakWaybillPrintSize }
) {
  const printSize = options?.printSize ?? CITYPAK_DEFAULT_WAYBILL_PRINT_SIZE;
  const merged = await PDFDocument.create();

  if (printSize === "4x6") {
    for (const part of parts) {
      const doc = await PDFDocument.load(part);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    return Buffer.from(await merged.save());
  }

  const perPage = 4;
  const cols = 2;
  const rows = 2;
  const cellW = A4_WIDTH / cols;
  const cellH = A4_HEIGHT / rows;
  const sourcePages: Awaited<ReturnType<PDFDocument["embedPages"]>> = [];

  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    const embedded = await merged.embedPages(doc.getPages());
    sourcePages.push(...embedded);
  }

  if (sourcePages.length === 0) {
    return Buffer.from(await merged.save());
  }

  for (let offset = 0; offset < sourcePages.length; offset += perPage) {
    const sheet = merged.addPage([A4_WIDTH, A4_HEIGHT]);
    const chunk = sourcePages.slice(offset, offset + perPage);
    chunk.forEach((embedded, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const scale = Math.min(cellW / embedded.width, cellH / embedded.height) * 0.98;
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;
      const x = col * cellW + (cellW - drawW) / 2;
      const y = A4_HEIGHT - (row + 1) * cellH + (cellH - drawH) / 2;
      sheet.drawPage(embedded, {
        x,
        y,
        xScale: scale,
        yScale: scale,
      });
    });
  }

  return Buffer.from(await merged.save());
}
