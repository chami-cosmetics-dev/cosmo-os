import { PDFDocument, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { clipBoxForCitypakWaybill, mergeCitypakWaybillPdfs } from "@/lib/citypak-waybill-pdf";

const A4 = { width: 595.28, height: 841.89 };

async function a4WaybillWithTopLabel() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  const width = 288;
  const height = 432;
  const x = (A4.width - width) / 2;
  const y = A4.height - height - 18;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });
  page.drawText("CITYPAK", { x: x + 20, y: y + height - 40, size: 18 });
  return { bytes: Buffer.from(await doc.save()), box: { x, y, width, height } };
}

describe("clipBoxForCitypakWaybill", () => {
  it("clips the top label, not the empty A4 page", async () => {
    const { bytes, box } = await a4WaybillWithTopLabel();
    const doc = await PDFDocument.load(bytes);
    const clip = clipBoxForCitypakWaybill(doc.getPages()[0]);
    // Must be label-sized — never nearly full A4 (that leaves L/R white after tiling).
    expect(clip.right - clip.left).toBeLessThan(A4.width * 0.72);
    expect(clip.top - clip.bottom).toBeLessThan(A4.height * 0.72);
    // Bleed expands clip a few pts so border strokes stay visible.
    expect(clip.left).toBeLessThanOrEqual(box.x + 0.5);
    expect(clip.bottom).toBeLessThanOrEqual(box.y + 0.5);
    expect(clip.right).toBeGreaterThanOrEqual(box.x + box.width - 0.5);
    expect(clip.top).toBeGreaterThanOrEqual(box.y + box.height - 0.5);
    expect(clip.right - clip.left).toBeGreaterThanOrEqual(box.width);
    expect(clip.top - clip.bottom).toBeGreaterThanOrEqual(box.height);
  });

  it("falls back to top-center inset crop when the page has no drawable ink", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([A4.width, A4.height]);
    const clip = clipBoxForCitypakWaybill(doc.getPages()[0]);
    const width = clip.right - clip.left;
    const height = clip.top - clip.bottom;
    // At most half A4 (+ tiny bleed) so side page margins are cut before stretch.
    expect(width).toBeLessThanOrEqual(A4.width / 2 + 1);
    expect(height).toBeLessThanOrEqual(A4.height / 2 + 10);
    expect((clip.left + clip.right) / 2).toBeCloseTo(A4.width / 2, 0);
    expect(clip.top).toBeGreaterThan(A4.height - 20);
  });
});

describe("mergeCitypakWaybillPdfs A4 4-up", () => {
  it("embeds the clipped label so each quarter is filled", async () => {
    const { bytes, box } = await a4WaybillWithTopLabel();
    const merged = await mergeCitypakWaybillPdfs([bytes, bytes, bytes, bytes], { layout: "A4" });
    const out = await PDFDocument.load(merged);
    expect(out.getPageCount()).toBe(1);

    const source = await PDFDocument.load(bytes);
    const clip = clipBoxForCitypakWaybill(source.getPages()[0]);
    expect(clip.right - clip.left).toBeGreaterThanOrEqual(box.width);
    expect(clip.top - clip.bottom).toBeGreaterThanOrEqual(box.height);

    const page = out.getPages()[0];
    expect(page.getWidth()).toBeCloseTo(A4.width, 1);
    expect(page.getHeight()).toBeCloseTo(A4.height, 1);
  });
});
