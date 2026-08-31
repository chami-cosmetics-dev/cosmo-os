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
  COUNTED_BUCKETS,
  countedListRowValues,
  snapshotRowsForBucket,
  type CountedBucket,
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

const EMPTY_COPY: Record<CountedBucket, string> = {
  Ongoing: "No ongoing counts",
  Done: "No completed counts",
  Difference: "No differences",
};

function bucketSection(snapshot: StockCountSnapshot, bucket: CountedBucket) {
  const rows = snapshotRowsForBucket(snapshot, bucket);
  const widths = snapshot.countedListHeaders.map((_, i) =>
    i === 1 ? "*" : "auto",
  );

  return [
    {
      text: `${bucket} (${rows.length})`,
      fontSize: 12,
      bold: true,
      margin: [0, 12, 0, 6],
    },
    rows.length === 0
      ? { text: EMPTY_COPY[bucket], fontSize: 9, italics: true }
      : {
          table: {
            headerRows: 1,
            widths,
            body: [
              snapshot.countedListHeaders.map((h) => ({
                text: h,
                bold: true,
                fontSize: 8,
              })),
              ...rows.map((row) =>
                countedListRowValues(snapshot, row).map((value, i) => ({
                  text: value === "" ? "-" : String(value),
                  fontSize: 7,
                  alignment: i === 0 || i === 1 ? "left" : "right",
                })),
              ),
            ],
          },
          layout: "lightHorizontalLines",
        },
  ];
}

export async function buildStockCountPdfBuffer(
  snapshot: StockCountSnapshot,
): Promise<Buffer> {
  const note = snapshot.isDraft
    ? "Draft snapshot. This download does not lock the count — keep scanning."
    : "Submitted report. Counts are locked.";

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
      { text: note, fontSize: 9, margin: [0, 0, 0, 8] },
      {
        text: `Status: ${snapshot.status}  ·  Captured: ${formatCapturedAt(snapshot.capturedAt)}`,
        fontSize: 9,
        margin: [0, 0, 0, 4],
      },
      {
        text:
          `Ongoing ${snapshot.ongoing}  ·  Done ${snapshot.done}  ·  Difference ${snapshot.difference}` +
          `  ·  Counted ${snapshot.counted}/${snapshot.itemCount}  ·  Total count ${snapshot.totalManualCount}`,
        fontSize: 9,
        margin: [0, 0, 0, 4],
      },
      ...COUNTED_BUCKETS.flatMap((bucket) => bucketSection(snapshot, bucket)),
      snapshot.pending > 0
        ? {
            text: `${snapshot.pending} pending SKUs omitted. Report uses Ongoing, Done, and Difference only.`,
            fontSize: 8,
            margin: [0, 10, 0, 0],
          }
        : {},
    ],
  };

  return pdfMake.createPdf(docDef).getBuffer();
}
