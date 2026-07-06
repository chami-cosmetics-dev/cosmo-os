/* eslint-disable @typescript-eslint/no-require-imports */
import { formatPickListBarcode } from "@/lib/product-item-barcode";

const pdfMake = require("pdfmake") as {
  virtualfs: { writeFileSync(filename: string, content: Buffer): void };
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  setLocalAccessPolicy(fn: (path: string) => boolean): void;
  createPdf(docDef: unknown): { getBuffer(): Promise<Buffer> };
};
const vfsFonts = require("pdfmake/build/vfs_fonts") as Record<string, string>;
/* eslint-enable @typescript-eslint/no-require-imports */

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

export type PickListLocation = {
  locationName: string;
  items: Array<{
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    barcode: string | null;
    quantity: number;
  }>;
};

const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0,
  hLineColor: () => "#cbd5e1",
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

export async function generatePickListPdf(
  locations: PickListLocation[],
  date: string,
  companyName: string | null,
  headerLine?: string | null,
): Promise<Buffer> {
  const content: unknown[] = [
    {
      columns: [
        { text: companyName ?? "Pick List", style: "title", width: "*" },
        { text: date, style: "headerSub", width: "auto" },
      ],
      margin: [0, 0, 0, 2],
    },
    { text: headerLine ?? "Inventory Pick List", style: "subtitle", margin: [0, 0, 0, 20] },
  ];

  for (let li = 0; li < locations.length; li++) {
    const location = locations[li];
    const totalUnits = location.items.reduce((s, i) => s + i.quantity, 0);

    const tableBody: unknown[][] = [
      [
        { text: "#", style: "th" },
        { text: "Item", style: "th" },
        { text: "SKU", style: "th" },
        { text: "Barcode", style: "th" },
        { text: "Qty", style: "th", alignment: "right" },
      ],
      ...location.items.map((item, idx) => [
        { text: String(idx + 1), style: "tdMuted" },
        item.variantTitle
          ? { stack: [{ text: item.productTitle, style: "td" }, { text: item.variantTitle, style: "cellSub" }] }
          : { text: item.productTitle, style: "td" },
        { text: item.sku ?? "—", style: "td" },
        { text: formatPickListBarcode(item.barcode), style: "barcode" },
        { text: String(item.quantity), style: "qty", alignment: "right" },
      ]),
      [
        {
          text: `${location.items.length} item type${location.items.length !== 1 ? "s" : ""}`,
          colSpan: 4,
          style: "total",
        },
        { text: "" },
        { text: "" },
        { text: "" },
        { text: String(totalUnits), style: "total", alignment: "right" },
      ],
    ];

    const sectionBlock: Record<string, unknown> = {
      stack: [
        { text: location.locationName, style: "locationHeader", margin: [0, 0, 0, 8] },
        {
          table: {
            headerRows: 1,
            widths: ["auto", "*", "auto", "auto", "auto"],
            body: tableBody,
          },
          layout: {
            ...tableLayout,
            fillColor: (i: number) =>
              i === 0 ? "#1e40af" : i === tableBody.length - 1 ? "#f1f5f9" : i % 2 === 0 ? "#f8fafc" : null,
          },
        },
      ],
    };

    if (li > 0) sectionBlock.pageBreak = "before";
    content.push(sectionBlock);
  }

  const docDef = {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [30, 40, 30, 40],
    content,
    styles: {
      title: { fontSize: 18, bold: true, color: "#0f172a" },
      subtitle: { fontSize: 10, color: "#64748b" },
      headerSub: { fontSize: 10, color: "#64748b", alignment: "right" },
      locationHeader: { fontSize: 14, bold: true, color: "#1e40af" },
      th: { fontSize: 9, bold: true, color: "#ffffff" },
      td: { fontSize: 9, color: "#0f172a" },
      tdMuted: { fontSize: 9, color: "#94a3b8" },
      cellSub: { fontSize: 8, color: "#64748b" },
      barcode: { fontSize: 10, bold: true, color: "#0f172a" },
      qty: { fontSize: 14, bold: true, color: "#0f172a" },
      total: { fontSize: 9, bold: true, color: "#0f172a" },
    },
    defaultStyle: { font: "Roboto" },
  };

  return pdfMake.createPdf(docDef).getBuffer();
}
