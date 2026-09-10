import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFRawStream,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
} from "pdf-lib";

import {
  CITYPAK_DEFAULT_PRINT_LAYOUT,
  CITYPAK_WAYBILL_SOURCE,
  downloadCitypakWaybillPdf,
  readCitypakPrintOverride,
  toCitypakAscii,
  toCitypakPhone,
  type CitypakPrintLayout,
  type CitypakShipmentOverride,
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
  bytes: Buffer;
}): Promise<string | null> {
  try {
    const blob = await put(
      `citypak-waybills/${input.companyId}/${input.folderKey}/${input.trackingNumber}.pdf`,
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
}): Promise<
  | { ok: true; bytes: Buffer; trackingNumber: string; filename: string; printOverride: CitypakShipmentOverride | null }
  | { ok: false; error: string; status: number }
> {
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
  const filename = `citypak-waybill-${trackingNumber}.pdf`;
  const printOverride = readCitypakPrintOverride(payload);

  const storedUrl =
    readString(payload, "waybillPdfUrl") ||
    readString(payload, "waybillPdfUrlA4") ||
    readString(payload, "waybillPdfUrl4x6");
  if (storedUrl) {
    const cached = await fetchBlobBytes(storedUrl);
    if (cached) {
      return { ok: true, bytes: cached, trackingNumber, filename, printOverride };
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
    pageSize: "A4",
  });
  if (!downloaded.ok) {
    return { ok: false, error: downloaded.error, status: downloaded.status ?? 502 };
  }

  const blobUrl = await cacheCitypakWaybillPdf({
    companyId: input.companyId,
    folderKey: waybill.orderId ?? waybill.id,
    trackingNumber,
    bytes: downloaded.bytes,
  });
  if (blobUrl) {
    await prisma.orderWaybill.update({
      where: { id: waybill.id },
      data: {
        rawPayload: { ...payload, waybillPdfUrl: blobUrl } as Prisma.InputJsonValue,
      },
    });
  }

  return { ok: true, bytes: downloaded.bytes, trackingNumber, filename, printOverride };
}

export async function loadCitypakWaybillPdfForOrder(input: {
  companyId: string;
  orderId: string;
}) {
  return loadCitypakWaybillPdf({ companyId: input.companyId, orderId: input.orderId });
}

/** Page sizes in PDF points. A4 quadrant = A6. */
const A4_SIZE = { width: 595.28, height: 841.89 };
const A5_SIZE = { width: 419.53, height: 595.28 };
/** Typical CityPak thermal label on an A4 download (points @ 72dpi). */
const LABEL_4X6 = { width: 288, height: 432 };
/**
 * Side inset when falling back on A4. Keep low so the label's left/right
 * black border stays inside the crop (high inset was clipping borders).
 */
const A4_LABEL_SIDE_INSET_RATIO = 0.04;
/** Expand detected/fallback clips slightly so border strokes are not cut. */
const CLIP_BORDER_BLEED_PT = 3;

type EmbeddedPage = Awaited<ReturnType<PDFDocument["embedPage"]>>;
type ClipBox = { left: number; bottom: number; right: number; top: number };
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function asNumber(value: unknown): number | null {
  return value instanceof PDFNumber ? value.asNumber() : null;
}

function boxArea(box: ClipBox) {
  return Math.max(0, box.right - box.left) * Math.max(0, box.top - box.bottom);
}

function growBox(box: ClipBox | null, x: number, y: number): ClipBox {
  if (!box) return { left: x, bottom: y, right: x, top: y };
  return {
    left: Math.min(box.left, x),
    bottom: Math.min(box.bottom, y),
    right: Math.max(box.right, x),
    top: Math.max(box.top, y),
  };
}

function growBoxCorners(box: ClipBox | null, m: Matrix, x0: number, y0: number, x1: number, y1: number): ClipBox {
  const corners: Array<[number, number]> = [
    apply(m, x0, y0),
    apply(m, x1, y0),
    apply(m, x0, y1),
    apply(m, x1, y1),
  ];
  let result = box;
  for (const [x, y] of corners) {
    result = growBox(result, x, y);
  }
  return result ?? { left: x0, bottom: y0, right: x1, top: y1 };
}

function decodePageContents(page: PDFPage): string {
  const contents = page.node.normalizedEntries().Contents;
  if (!(contents instanceof PDFArray)) return "";
  const chunks: Buffer[] = [];
  for (let index = 0; index < contents.size(); index += 1) {
    const stream = contents.lookup(index, PDFStream);
    if (stream instanceof PDFRawStream) {
      chunks.push(Buffer.from(decodePDFRawStream(stream).decode()));
    } else {
      const encoded = stream as unknown as { getUnencodedContents?: () => Uint8Array };
      if (typeof encoded.getUnencodedContents === "function") {
        chunks.push(Buffer.from(encoded.getUnencodedContents()));
      }
    }
  }
  return Buffer.concat(chunks).toString("latin1");
}

function tokenizeContent(content: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < content.length) {
    const char = content[index];
    if (char === "%") {
      while (index < content.length && content[index] !== "\n") index += 1;
      continue;
    }
    if (char <= " ") {
      index += 1;
      continue;
    }
    if (char === "(") {
      let depth = 1;
      index += 1;
      while (index < content.length && depth > 0) {
        if (content[index] === "\\") {
          index += 2;
          continue;
        }
        if (content[index] === "(") depth += 1;
        else if (content[index] === ")") depth -= 1;
        index += 1;
      }
      tokens.push("()");
      continue;
    }
    if (char === "<") {
      if (content[index + 1] === "<") {
        tokens.push("<<");
        index += 2;
        continue;
      }
      const end = content.indexOf(">", index);
      tokens.push("<>");
      index = end < 0 ? content.length : end + 1;
      continue;
    }
    if (char === ">") {
      index += content[index + 1] === ">" ? 2 : 1;
      tokens.push(">>");
      continue;
    }
    if (char === "[" || char === "]") {
      tokens.push(char);
      index += 1;
      continue;
    }
    if (char === "/") {
      let end = index + 1;
      while (end < content.length && !/[()<>[\]{}/%\s]/.test(content[end])) end += 1;
      tokens.push(content.slice(index, end));
      index = end;
      continue;
    }
    let end = index + 1;
    while (end < content.length && !/[\s()<>[\]{}/%]/.test(content[end])) end += 1;
    tokens.push(content.slice(index, end));
    index = end;
  }
  return tokens;
}

function inkBoxFromContent(page: PDFPage, pageBox: ClipBox): ClipBox | null {
  const pageArea = boxArea(pageBox);
  if (pageArea <= 0) return null;

  const xObjects = page.node.normalizedEntries().XObject;
  const tokens = tokenizeContent(decodePageContents(page));
  const ctmStack: Matrix[] = [IDENTITY];
  let ctm = IDENTITY;
  const numbers: number[] = [];
  let lastName = "";
  let path: ClipBox | null = null;
  const candidates: ClipBox[] = [];
  let ink: ClipBox | null = null;

  const consider = (next: ClipBox | null) => {
    if (!next) return;
    const width = next.right - next.left;
    const height = next.top - next.bottom;
    if (width < 2 || height < 2) return;
    if (boxArea(next) > pageArea * 0.9) return;
    ink = growBox(ink, next.left, next.bottom);
    ink = growBox(ink, next.right, next.top);
    if (
      width > (pageBox.right - pageBox.left) * 0.15 &&
      height > (pageBox.top - pageBox.bottom) * 0.15
    ) {
      candidates.push(next);
    }
  };

  const addPoint = (x: number, y: number) => {
    const [tx, ty] = apply(ctm, x, y);
    path = growBox(path, tx, ty);
  };

  for (const token of tokens) {
    if (token.startsWith("/")) {
      lastName = token.slice(1);
      continue;
    }
    const numeric = Number(token);
    if (token !== "" && Number.isFinite(numeric) && /^-?\d/.test(token)) {
      numbers.push(numeric);
      continue;
    }

    if (token === "q") {
      ctmStack.push(ctm);
    } else if (token === "Q") {
      ctm = ctmStack.pop() ?? IDENTITY;
      if (ctmStack.length === 0) ctmStack.push(IDENTITY);
    } else if (token === "cm" && numbers.length >= 6) {
      const next = numbers.splice(numbers.length - 6, 6) as Matrix;
      ctm = multiply(ctm, next);
    } else if (token === "re" && numbers.length >= 4) {
      const [x, y, width, height] = numbers.splice(numbers.length - 4, 4);
      path = growBoxCorners(path, ctm, x, y, x + width, y + height);
      consider(growBoxCorners(null, ctm, x, y, x + width, y + height));
    } else if ((token === "m" || token === "l") && numbers.length >= 2) {
      const [x, y] = numbers.splice(numbers.length - 2, 2);
      addPoint(x, y);
    } else if (token === "c" && numbers.length >= 6) {
      const pts = numbers.splice(numbers.length - 6, 6);
      for (let i = 0; i < 6; i += 2) addPoint(pts[i], pts[i + 1]);
    } else if (
      token === "S" ||
      token === "s" ||
      token === "f" ||
      token === "F" ||
      token === "f*" ||
      token === "B" ||
      token === "B*" ||
      token === "b" ||
      token === "b*"
    ) {
      consider(path);
      path = null;
    } else if (token === "n" || token === "W" || token === "W*") {
      path = null;
    } else if (token === "Do" && xObjects instanceof PDFDict && lastName) {
      const xObject = xObjects.lookup(PDFName.of(lastName));
      const dict =
        xObject instanceof PDFStream
          ? (xObject as PDFStream).dict
          : xObject instanceof PDFDict
            ? xObject
            : null;
      const bboxLookup = dict?.lookup(PDFName.of("BBox"));
      const bboxArray = bboxLookup instanceof PDFArray ? bboxLookup : null;
      if (bboxArray && bboxArray.size() >= 4) {
        const left = asNumber(bboxArray.lookup(0)) ?? 0;
        const bottom = asNumber(bboxArray.lookup(1)) ?? 0;
        const right = asNumber(bboxArray.lookup(2)) ?? 1;
        const top = asNumber(bboxArray.lookup(3)) ?? 1;
        consider(growBoxCorners(null, ctm, left, bottom, right, top));
      } else {
        // Form XObject without BBox — unit square under current CTM is enough for ink bounds.
        consider(growBoxCorners(null, ctm, 0, 0, 1, 1));
      }
    }

    if (!/^-?\d/.test(token) && token !== "q" && token !== "Q") {
      if (
        token !== "cm" &&
        token !== "re" &&
        token !== "m" &&
        token !== "l" &&
        token !== "c"
      ) {
        numbers.length = 0;
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => boxArea(b) - boxArea(a));
    return candidates[0];
  }
  if (ink && boxArea(ink) > pageArea * 0.05 && boxArea(ink) < pageArea * 0.9) {
    return ink;
  }
  return null;
}

function expandClip(box: ClipBox, pageBox: ClipBox, bleed = CLIP_BORDER_BLEED_PT): ClipBox {
  return {
    left: Math.max(pageBox.left, box.left - bleed),
    bottom: Math.max(pageBox.bottom, box.bottom - bleed),
    right: Math.min(pageBox.right, box.right + bleed),
    top: Math.min(pageBox.top, box.top + bleed),
  };
}

/**
 * CityPak A4 downloads put one thermal-sized label at the top-center of a full
 * A4 sheet. Clip that label (keep full L/R border), then stretch into each print
 * cell with a small pad from the cut lines.
 */
export function clipBoxForCitypakWaybill(page: PDFPage): ClipBox {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const art = page.getArtBox();
  const pageBox: ClipBox = {
    left: crop.x,
    bottom: crop.y,
    right: crop.x + crop.width,
    top: crop.y + crop.height,
  };
  const pageW = pageBox.right - pageBox.left;
  const pageH = pageBox.top - pageBox.bottom;
  const pageArea = pageW * pageH;

  const looksLikeLabelAlready = pageW <= 340 && pageH <= 500;
  if (looksLikeLabelAlready) {
    return pageBox;
  }

  const isUsefulBox = (box: ClipBox) => {
    const width = box.right - box.left;
    const height = box.top - box.bottom;
    if (width < 120 || height < 160) return false;
    // Reject near-full-page boxes — those keep the left/right white margins.
    if (width > pageW * 0.72 || height > pageH * 0.72) return false;
    if (boxArea(box) > pageArea * 0.45) return false;
    return true;
  };

  if (art.width > 20 && art.height > 20) {
    const artBox: ClipBox = {
      left: art.x,
      bottom: art.y,
      right: art.x + art.width,
      top: art.y + art.height,
    };
    if (isUsefulBox(artBox)) return expandClip(artBox, pageBox);
  }

  const detected = inkBoxFromContent(page, pageBox);
  if (detected && isUsefulBox(detected)) return expandClip(detected, pageBox);

  // Top-center crop close to half-A4 width so L/R borders stay in frame.
  const cellW = pageW / 2;
  const cellH = pageH / 2;
  const inset = cellW * A4_LABEL_SIDE_INSET_RATIO;
  const width = Math.min(LABEL_4X6.width + CLIP_BORDER_BLEED_PT * 2, cellW - 2 * inset);
  const height = Math.min(LABEL_4X6.height + CLIP_BORDER_BLEED_PT * 2, cellH);
  const left = pageBox.left + (pageW - width) / 2;
  const top = pageBox.top - Math.min(4, pageH * 0.005);
  return expandClip(
    {
      left,
      bottom: top - height,
      right: left + width,
      top,
    },
    pageBox
  );
}

/** Gap from cut lines / page edge so waybills are not flush. ~3.5mm. */
const PRINT_CELL_PAD_PT = 10;

function drawFilled(
  sheet: ReturnType<PDFDocument["addPage"]>,
  embedded: EmbeddedPage,
  cell: { x: number; y: number; width: number; height: number },
  pad = PRINT_CELL_PAD_PT
) {
  const inset = Math.max(0, Math.min(pad, cell.width / 8, cell.height / 8));
  sheet.drawPage(embedded, {
    x: cell.x + inset,
    y: cell.y + inset,
    width: cell.width - inset * 2,
    height: cell.height - inset * 2,
  });
}

async function embedClippedWaybill(target: PDFDocument, sourceBytes: Buffer): Promise<EmbeddedPage[]> {
  const source = await PDFDocument.load(sourceBytes);
  const embedded: EmbeddedPage[] = [];
  for (const page of source.getPages()) {
    const clip = clipBoxForCitypakWaybill(page);
    try {
      embedded.push(await target.embedPage(page, clip));
    } catch (err) {
      console.error("[citypak-waybill-pdf] clip embed failed, retry fixed crop", err);
      const media = page.getMediaBox();
      const width = Math.min(LABEL_4X6.width, media.width * 0.98);
      const height = Math.min(LABEL_4X6.height, media.height * 0.98);
      const left = media.x + (media.width - width) / 2;
      const top = media.y + media.height - 8;
      embedded.push(
        await target.embedPage(page, {
          left,
          bottom: top - height,
          right: left + width,
          top,
        })
      );
    }
  }
  return embedded;
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = toCitypakAscii(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function stampPrintOverride(
  sheet: ReturnType<PDFDocument["addPage"]>,
  fonts: { regular: PDFFont; bold: PDFFont },
  cell: { x: number; y: number; width: number; height: number },
  shipment: CitypakShipmentOverride
) {
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  const toX = cell.x + cell.width * 0.4;
  const toW = cell.width * 0.58;
  const toY = cell.y + cell.height * 0.56;
  const toH = cell.height * 0.28;
  sheet.drawRectangle({ x: toX, y: toY, width: toW, height: toH, color: white });

  const size = Math.max(6, Math.min(9, toH / 7));
  const maxWidth = toW - 6;
  const details = [
    shipment.receiverName,
    shipment.receiverAddress1,
    shipment.receiverAddress2,
    shipment.receiverCity,
    toCitypakPhone(shipment.receiverPhone),
  ].flatMap((line) => wrapText(fonts.regular, line, size, maxWidth));

  let cursor = toY + toH - size - 3;
  for (const line of details) {
    if (cursor < toY + 2) break;
    sheet.drawText(line, { x: toX + 3, y: cursor, size, font: fonts.regular, color: black });
    cursor -= size + 1.4;
  }

  const amount = shipment.cashOnDeliveryAmount ?? 0;
  const codLabel =
    amount > 0 ? `COD ${amount.toLocaleString("en-LK", { minimumFractionDigits: 2 })}` : "SENDER ACCOUNT";
  const codX = cell.x + cell.width * 0.48;
  const codW = cell.width * 0.5;
  const codY = cell.y + cell.height * 0.26;
  const codH = cell.height * 0.12;
  const codSize = Math.max(7, Math.min(11, codH * 0.4));
  sheet.drawRectangle({ x: codX, y: codY, width: codW, height: codH, color: white });
  sheet.drawText(toCitypakAscii(codLabel), {
    x: codX + 4,
    y: codY + (codH - codSize) / 2,
    size: codSize,
    font: fonts.bold,
    color: black,
  });
}

/**
 * Lay waybill PDFs out for printing.
 * - A4: 4 waybills per sheet (2×2) with dashed cut guides, each filling its quarter
 * - A5: 1 waybill per sheet, filling the page
 * Edited name/address/phone/COD (printOverride) is stamped on top; tracking stays the same.
 */
export async function mergeCitypakWaybillPdfs(
  parts: Buffer[],
  options?: { layout?: CitypakPrintLayout; overlays?: Array<CitypakShipmentOverride | null> }
) {
  const layout = options?.layout ?? CITYPAK_DEFAULT_PRINT_LAYOUT;
  const merged = await PDFDocument.create();
  const fonts = {
    regular: await merged.embedFont(StandardFonts.Helvetica),
    bold: await merged.embedFont(StandardFonts.HelveticaBold),
  };
  const sourcePages: Array<{ embedded: EmbeddedPage; overlay: CitypakShipmentOverride | null }> = [];

  for (const [index, part] of parts.entries()) {
    const overlay = options?.overlays?.[index] ?? null;
    for (const embedded of await embedClippedWaybill(merged, part)) {
      sourcePages.push({ embedded, overlay });
    }
  }

  if (sourcePages.length === 0) {
    return Buffer.from(await merged.save());
  }

  const place = (
    sheet: ReturnType<PDFDocument["addPage"]>,
    item: { embedded: EmbeddedPage; overlay: CitypakShipmentOverride | null },
    cell: { x: number; y: number; width: number; height: number }
  ) => {
    const inset = Math.max(0, Math.min(PRINT_CELL_PAD_PT, cell.width / 8, cell.height / 8));
    const padded = {
      x: cell.x + inset,
      y: cell.y + inset,
      width: cell.width - inset * 2,
      height: cell.height - inset * 2,
    };
    drawFilled(sheet, item.embedded, cell);
    if (item.overlay) stampPrintOverride(sheet, fonts, padded, item.overlay);
  };

  if (layout === "A5") {
    for (const item of sourcePages) {
      const sheet = merged.addPage([A5_SIZE.width, A5_SIZE.height]);
      place(sheet, item, { x: 0, y: 0, ...A5_SIZE });
    }
    return Buffer.from(await merged.save());
  }

  const cellWidth = A4_SIZE.width / 2;
  const cellHeight = A4_SIZE.height / 2;

  for (let offset = 0; offset < sourcePages.length; offset += 4) {
    const sheet = merged.addPage([A4_SIZE.width, A4_SIZE.height]);
    sourcePages.slice(offset, offset + 4).forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      place(sheet, item, {
        x: col * cellWidth,
        y: A4_SIZE.height - (row + 1) * cellHeight,
        width: cellWidth,
        height: cellHeight,
      });
    });

    const cutLine = { thickness: 0.5, color: rgb(0.6, 0.6, 0.6), dashArray: [4, 4] };
    sheet.drawLine({
      start: { x: 0, y: cellHeight },
      end: { x: A4_SIZE.width, y: cellHeight },
      ...cutLine,
    });
    sheet.drawLine({
      start: { x: cellWidth, y: 0 },
      end: { x: cellWidth, y: A4_SIZE.height },
      ...cutLine,
    });
  }

  return Buffer.from(await merged.save());
}
