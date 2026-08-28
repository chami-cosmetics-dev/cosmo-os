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

export type DispatchGroupForPdf = {
  dispatcherName: string;
  dispatchType: "rider" | "courier" | "customer";
  orders: Array<{
    reference: string;
    shopifyReference: string;
    erpReference: string | null;
    orderDate: string;
    dispatchedAt: string;
    customerName: string | null;
    customerPhone: string | null;
    merchantName: string | null;
    city: string | null;
    address: string | null;
    totalPrice: string;
    currency: string;
    paymentType: string | null;
    locationName: string;
  }>;
};

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

function compactLayout(orderCount: number) {
  if (orderCount <= 30) {
    return {
      th: 6.5,
      td: 6.5,
      meta: 7,
      footer: 7,
      padding: 2,
      margins: [10, 10, 10, 10] as [number, number, number, number],
    };
  }
  if (orderCount <= 45) {
    return {
      th: 6,
      td: 6,
      meta: 6.5,
      footer: 6.5,
      padding: 1.5,
      margins: [8, 8, 8, 8] as [number, number, number, number],
    };
  }
  if (orderCount <= 60) {
    return {
      th: 5.5,
      td: 5.5,
      meta: 6,
      footer: 6,
      padding: 1,
      margins: [6, 6, 6, 6] as [number, number, number, number],
    };
  }
  return {
    th: 5,
    td: 5,
    meta: 5.5,
    footer: 5.5,
    padding: 1,
    margins: [6, 6, 6, 6] as [number, number, number, number],
  };
}

function formatPrintDate(iso: string) {
  return iso.replace(/-/g, ".");
}

function formatAmountCompact(price: string) {
  const n = parseFloat(price);
  if (Number.isNaN(n)) return price;
  if (Number.isInteger(n)) {
    return n.toLocaleString("en-LK", { maximumFractionDigits: 0 });
  }
  return n.toLocaleString("en-LK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function addressWithoutCity(address: string | null, city: string | null): string {
  if (!address) return "-";
  if (!city) return address;
  const trimmed = address.trim();
  if (trimmed.endsWith(city)) {
    const without = trimmed.slice(0, -city.length).replace(/,\s*$/, "").trim();
    return without || address;
  }
  return address;
}

function orderTrackingRef(order: DispatchGroupForPdf["orders"][number]) {
  return order.shopifyReference || order.reference;
}

function orderReferenceRef(order: DispatchGroupForPdf["orders"][number]) {
  return order.erpReference || order.reference;
}

function dispatchHandlerLabel(type: DispatchGroupForPdf["dispatchType"]) {
  if (type === "rider") return "Rider";
  if (type === "courier") return "Courier";
  return "Pickup";
}

export async function generateDispatchGroupPdf(
  group: DispatchGroupForPdf,
  dateFrom: string,
  dateTo: string,
): Promise<Buffer> {
  const layout = compactLayout(group.orders.length);
  const printDate = formatPrintDate(dateFrom === dateTo ? dateFrom : dateTo);
  const grandTotal = group.orders.reduce((sum, order) => sum + (parseFloat(order.totalPrice) || 0), 0);
  const packageCount = group.orders.length;

  const tableBody: unknown[][] = [
    [
      { text: "No", style: "th", alignment: "center" },
      { text: "Order Tracking", style: "th" },
      { text: "Reference", style: "th" },
      { text: "Customer", style: "th" },
      { text: "Address", style: "th" },
      { text: "City", style: "th" },
      { text: "Amount", style: "th", alignment: "right" },
    ],
    ...group.orders.map((order, index) => [
      { text: String(index + 1), style: "td", alignment: "center" },
      { text: orderTrackingRef(order), style: "tdMono" },
      { text: orderReferenceRef(order), style: "tdMono" },
      { text: order.customerName ?? "-", style: "td" },
      { text: addressWithoutCity(order.address, order.city), style: "td" },
      { text: order.city ?? "-", style: "td" },
      { text: formatAmountCompact(order.totalPrice), style: "td", alignment: "right", noWrap: true },
    ]),
    [
      { text: "", colSpan: 5, border: [true, true, false, true] },
      {},
      {},
      {},
      {},
      { text: "Total", style: "totalLabel", alignment: "right", bold: true },
      { text: formatAmountCompact(String(grandTotal)), style: "totalAmount", alignment: "right", bold: true, noWrap: true },
    ],
  ];

  const tableLayout = {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => "#000000",
    vLineColor: () => "#000000",
    paddingLeft: () => layout.padding,
    paddingRight: () => layout.padding,
    paddingTop: () => layout.padding,
    paddingBottom: () => layout.padding,
  };

  const docDef = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: layout.margins,
    content: [
      {
        columns: [
          {
            text: `${dispatchHandlerLabel(group.dispatchType)}: ${group.dispatcherName}`,
            style: "meta",
            width: "*",
          },
          {
            text: `Date ${printDate}`,
            style: "meta",
            alignment: "right",
            width: "auto",
          },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [18, 52, 48, 68, "*", 52, 42],
          body: tableBody,
        },
        layout: {
          ...tableLayout,
          fillColor: (i: number) => {
            if (i === 0) return "#eeeeee";
            if (i === tableBody.length - 1) return "#f5f5f5";
            return null;
          },
        },
      },
      {
        columns: [
          {
            width: "40%",
            stack: [
              { text: `Packages - ${packageCount}`, style: "footerText", margin: [0, 10, 0, 2] },
              { text: `Date - ${printDate}`, style: "footerText" },
            ],
          },
          {
            width: "60%",
            stack: [
              {
                canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5 }],
                margin: [0, 28, 0, 2],
                alignment: "center",
              },
              { text: "Signature", style: "footerHint", alignment: "center" },
            ],
          },
        ],
        margin: [0, 4, 0, 0],
      },
    ],
    styles: {
      meta: { fontSize: layout.meta, bold: true, color: "#000000" },
      th: { fontSize: layout.th, bold: true, color: "#000000" },
      td: { fontSize: layout.td, color: "#111111" },
      tdMono: { fontSize: layout.td, color: "#000000" },
      totalLabel: { fontSize: layout.td, bold: true, color: "#000000" },
      totalAmount: { fontSize: layout.td, bold: true, color: "#000000" },
      footerText: { fontSize: layout.footer, bold: true, color: "#000000" },
      footerHint: { fontSize: layout.footer - 0.5, color: "#444444" },
    },
    defaultStyle: { font: "Roboto" },
  };

  return pdfMake.createPdf(docDef).getBuffer();
}
