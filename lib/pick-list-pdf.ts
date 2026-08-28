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

export type PickListPdfItem = {
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
};

function compactLayout(itemCount: number) {
  if (itemCount <= 20) {
    return {
      landscape: false,
      margins: [24, 28, 24, 28] as [number, number, number, number],
      title: 16,
      subtitle: 9,
      th: 8,
      td: 8,
      qty: 12,
      padding: 4,
    };
  }
  if (itemCount <= 35) {
    return {
      landscape: false,
      margins: [20, 22, 20, 22] as [number, number, number, number],
      title: 14,
      subtitle: 8,
      th: 7,
      td: 7,
      qty: 10,
      padding: 3,
    };
  }
  if (itemCount <= 55) {
    return {
      landscape: false,
      margins: [16, 18, 16, 18] as [number, number, number, number],
      title: 12,
      subtitle: 7,
      th: 6,
      td: 6,
      qty: 9,
      padding: 2,
    };
  }
  return {
    landscape: true,
    margins: [14, 16, 14, 16] as [number, number, number, number],
    title: 11,
    subtitle: 7,
    th: 5.5,
    td: 5.5,
    qty: 8,
    padding: 1.5,
  };
}

function itemLabel(item: PickListPdfItem) {
  const title = item.productTitle.trim();
  const variant = item.variantTitle?.trim();
  if (!variant || variant === "Default Title") return title;
  return `${title} — ${variant}`;
}

export async function generatePickListPdf(
  items: PickListPdfItem[],
  date: string,
  companyName: string | null,
  headerLine?: string | null,
  meta?: { orderCount?: number },
): Promise<Buffer> {
  const layout = compactLayout(items.length);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const orderNote =
    meta?.orderCount != null
      ? `${meta.orderCount} order${meta.orderCount !== 1 ? "s" : ""} · `
      : "";

  const tableLayout = {
    hLineWidth: () => 0.25,
    vLineWidth: () => 0,
    hLineColor: () => "#cbd5e1",
    paddingLeft: () => layout.padding,
    paddingRight: () => layout.padding,
    paddingTop: () => layout.padding,
    paddingBottom: () => layout.padding,
  };

  const tableBody: unknown[][] = [
    [
      { text: "#", style: "th" },
      { text: "Item", style: "th" },
      { text: "SKU", style: "th" },
      { text: "Barcode", style: "th" },
      { text: "Qty", style: "th", alignment: "right" },
    ],
    ...items.map((item, idx) => [
      { text: String(idx + 1), style: "tdMuted" },
      { text: itemLabel(item), style: "td" },
      { text: item.sku ?? "—", style: "tdMono" },
      { text: formatPickListBarcode(item.barcode), style: "barcode" },
      { text: String(item.quantity), style: "qty", alignment: "right" },
    ]),
    [
      {
        text: `${orderNote}${items.length} item type${items.length !== 1 ? "s" : ""}`,
        colSpan: 4,
        style: "total",
      },
      { text: "" },
      { text: "" },
      { text: "" },
      { text: String(totalUnits), style: "total", alignment: "right" },
    ],
  ];

  const docDef = {
    pageSize: "A4",
    pageOrientation: layout.landscape ? "landscape" : "portrait",
    pageMargins: layout.margins,
    content: [
      {
        columns: [
          { text: companyName ?? "Pick List", style: "title", width: "*" },
          { text: date, style: "headerSub", width: "auto" },
        ],
        margin: [0, 0, 0, 2],
      },
      {
        text: headerLine ?? "Inventory Pick List",
        style: "subtitle",
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
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
    styles: {
      title: { fontSize: layout.title, bold: true, color: "#0f172a" },
      subtitle: { fontSize: layout.subtitle, color: "#64748b" },
      headerSub: { fontSize: layout.subtitle, color: "#64748b", alignment: "right" },
      th: { fontSize: layout.th, bold: true, color: "#ffffff" },
      td: { fontSize: layout.td, color: "#0f172a" },
      tdMono: { fontSize: layout.td, color: "#0f172a" },
      tdMuted: { fontSize: layout.td, color: "#94a3b8" },
      barcode: { fontSize: layout.td + 0.5, bold: true, color: "#0f172a" },
      qty: { fontSize: layout.qty, bold: true, color: "#0f172a" },
      total: { fontSize: layout.td, bold: true, color: "#0f172a" },
    },
    defaultStyle: { font: "Roboto" },
  };

  return pdfMake.createPdf(docDef).getBuffer();
}
