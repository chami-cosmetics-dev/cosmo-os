import "server-only";

/* eslint-disable @typescript-eslint/no-require-imports */
const pdfMake = require("pdfmake") as {
  virtualfs: { writeFileSync(filename: string, content: Buffer): void };
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  setLocalAccessPolicy(fn: (path: string) => boolean): void;
  createPdf(docDef: unknown): { getBuffer(): Promise<Buffer> };
};
const vfsFonts = require("pdfmake/build/vfs_fonts") as Record<string, string>;
/* eslint-enable @typescript-eslint/no-require-imports */

import {
  countedListRowValues,
  type StockCountSnapshot,
} from "@/lib/store-stock-count/export-snapshot";

for (const [key, val] of Object.entries(vfsFonts)) {
  pdfMake.virtualfs.writeFileSync(key, Buffer.from(val, "base64"));
}
pdfMake.addFonts({
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
});
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => false);

function formatCapturedAt(iso: string) {
  return new Intl.DateTimeFormat("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export async function buildStockCountPdfBuffer(
  snapshot: StockCountSnapshot,
): Promise<Buffer> {
  const note =
    snapshot.countView === "personal"
      ? snapshot.isDraft
        ? "Your counts only. The other counter's scans are not in this file. Download does not lock the count."
        : "Your counts from this report."
      : snapshot.isDraft
        ? "Combined counts from every counter. This download does not lock the count."
        : "Submitted report. Combined counts are locked.";
  const lastCol = snapshot.countedListHeaders.length - 1;
  const widths = snapshot.countedListHeaders.map((_, i) =>
    i === 1 ? "*" : "auto",
  );

  const docDef = {
    pageOrientation: "portrait" as const,
    pageMargins: [24, 36, 24, 36],
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: "right",
      fontSize: 8,
      margin: [24, 0, 24, 16],
    }),
    content: [
      { text: snapshot.title, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      snapshot.countView === "personal" && snapshot.viewerLabel
        ? {
            text: `Counter: ${snapshot.viewerLabel}`,
            fontSize: 10,
            margin: [0, 0, 0, 4],
          }
        : {},
      { text: note, fontSize: 9, margin: [0, 0, 0, 8] },
      {
        text: `Status: ${snapshot.status}  ·  Captured: ${formatCapturedAt(snapshot.capturedAt)}`,
        fontSize: 9,
        margin: [0, 0, 0, 4],
      },
      {
        text:
          `Ongoing ${snapshot.ongoing}  ·  Done ${snapshot.done}  ·  Difference ${snapshot.difference}` +
          `  ·  Pending ${snapshot.pending}  ·  Total count ${snapshot.totalManualCount}`,
        fontSize: 9,
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths,
          body: [
            snapshot.countedListHeaders.map((h) => ({
              text: h,
              bold: true,
              fontSize: 8,
            })),
            ...snapshot.rows.map((row) =>
              countedListRowValues(snapshot, row).map((value, i) => ({
                text: value === "" ? "-" : String(value),
                fontSize: 7,
                alignment: i === 0 || i === 1 || i === lastCol ? "left" : "right",
              })),
            ),
          ],
        },
        layout: "lightHorizontalLines",
      },
    ],
  };

  return pdfMake.createPdf(docDef).getBuffer();
}
