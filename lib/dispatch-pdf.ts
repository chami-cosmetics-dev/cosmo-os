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

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
}

function formatAmount(price: string) {
  const n = parseFloat(price);
  return Number.isNaN(n) ? price : n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
}

function formatPayment(raw: string | null) {
  if (!raw) return "-";
  const normalized = raw.toLowerCase().replace(/[_\-\s]+/g, " ").trim();
  if (normalized === "cod" || normalized.includes("cash on delivery") || normalized.includes("cash")) {
    return "CASH PAYMENT\nON DEL";
  }
  if (normalized.includes("card on delivery") || normalized.includes("card payment on delivery")) {
    return "CARD ON DEL";
  }
  if (
    normalized.includes("koko") ||
    normalized.includes("webxpay") ||
    normalized.includes("bank") ||
    normalized.includes("card") ||
    normalized.includes("shopify payments") ||
    normalized === "paid"
  ) {
    return "ONLINE PAID";
  }
  return raw.replace(/[_-]+/g, " ").toUpperCase();
}

function dispatchHandlerLabel(type: DispatchGroupForPdf["dispatchType"]) {
  if (type === "rider") return "Rider";
  if (type === "courier") return "Courier";
  return "Handler";
}

export async function generateDispatchGroupPdf(
  group: DispatchGroupForPdf,
  dateFrom: string,
  dateTo: string,
): Promise<Buffer> {
  const dateLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} to ${dateTo}`;

  const grandTotal = group.orders.reduce((sum, order) => sum + (parseFloat(order.totalPrice) || 0), 0);
  const isRider = group.dispatchType === "rider";

  const tableBody: unknown[][] = [
    isRider
      ? [
          { text: "NO", style: "th", alignment: "center" },
          { text: "LOCATION", style: "th" },
          { text: "L.DEL.DATE", style: "th" },
          { text: "INV. NO", style: "th" },
          { text: "P.M", style: "th" },
          { text: "CITY", style: "th" },
          { text: "ADDRESS", style: "th" },
          { text: "T/P NO", style: "th" },
          { text: "CUSTOMER", style: "th" },
          { text: "MERCHANT", style: "th" },
          { text: "TOTAL", style: "th", alignment: "right", noWrap: true },
        ]
      : [
          { text: "NO", style: "th", alignment: "center" },
          { text: "LOCATION", style: "th" },
          { text: "L.DEL.DATE", style: "th" },
          { text: "INV. NO", style: "th" },
          { text: "P.M", style: "th" },
          { text: "CITY", style: "th" },
          { text: "ADDRESS", style: "th" },
          { text: "T/P NO", style: "th" },
          { text: "MERCHANT", style: "th" },
          { text: "TOTAL", style: "th", alignment: "right", noWrap: true },
        ],
    ...group.orders.map((order, index) => {
      const invLines: string[] = [];
      if (order.shopifyReference) invLines.push(order.shopifyReference);
      if (order.erpReference && order.erpReference !== order.shopifyReference) {
        invLines.push(order.erpReference);
      }
      if (invLines.length === 0) invLines.push(order.reference);

      const baseRow = [
        { text: String(index + 1), style: "td", alignment: "center" },
        { text: order.locationName, style: "td" },
        { text: formatDate(order.dispatchedAt), style: "td" },
        { text: invLines.join("\n"), style: "td" },
        { text: formatPayment(order.paymentType), style: "td" },
        { text: order.city ?? "-", style: "td" },
        { text: order.address ?? "-", style: "td" },
        { text: order.customerPhone ?? "-", style: "td" },
      ];
      if (isRider) {
        baseRow.push({ text: order.customerName ?? "-", style: "td" });
      }
      baseRow.push(
        { text: order.merchantName ?? "-", style: "merchantTd" },
        { text: formatAmount(order.totalPrice), style: "td", alignment: "right", noWrap: true },
      );
      return baseRow;
    }),
    isRider
      ? [
          { text: `TOTAL (${group.orders.length} orders)`, style: "totalLabel", colSpan: 10, alignment: "right", bold: true },
          {}, {}, {}, {}, {}, {}, {}, {}, {},
          { text: formatAmount(String(grandTotal)), style: "totalAmount", alignment: "right", bold: true, noWrap: true },
        ]
      : [
          { text: `TOTAL (${group.orders.length} orders)`, style: "totalLabel", colSpan: 9, alignment: "right", bold: true },
          {}, {}, {}, {}, {}, {}, {}, {},
          { text: formatAmount(String(grandTotal)), style: "totalAmount", alignment: "right", bold: true, noWrap: true },
        ],
  ];

  const tableLayout = {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => "#000000",
    vLineColor: () => "#000000",
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  };

  const docDef = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [22, 18, 22, 18],
    content: [
      {
        columns: [
          { text: "Full Delivery Summary", style: "title" },
          {
            stack: [
              {
                text: `${dispatchHandlerLabel(group.dispatchType)}: ${group.dispatcherName}`,
                style: "headerMeta",
                alignment: "right",
              },
              {
                text: `Date: ${dateLabel}`,
                style: "headerMeta",
                alignment: "right",
                margin: [0, 2, 0, 0],
              },
            ],
          },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          headerRows: 1,
          widths: isRider
            ? [22, 65, 55, 52, 68, 55, 108, 60, 72, 60, 78]
            : [22, 78, 62, 54, 76, 66, 132, 68, 72, 82],
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
    ],
    styles: {
      title: { fontSize: 15, bold: true, color: "#000000" },
      headerMeta: { fontSize: 9, bold: true, color: "#000000" },
      th: { fontSize: 9, bold: true, color: "#6f6f6f" },
      td: { fontSize: 9, color: "#777777" },
      merchantTd: { fontSize: 8, color: "#777777" },
      totalLabel: { fontSize: 9, bold: true, color: "#000000" },
      totalAmount: { fontSize: 10, bold: true, color: "#000000" },
    },
    footer: {
      text: `${dateLabel} | ${group.dispatcherName}`,
      alignment: "right",
      margin: [0, 0, 22, 0],
      fontSize: 7,
      color: "#777777",
    },
    defaultStyle: { font: "Roboto" },
  };

  return pdfMake.createPdf(docDef).getBuffer();
}


