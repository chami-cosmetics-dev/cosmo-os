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
  dispatchType: "rider" | "courier";
  orders: Array<{
    reference: string;
    orderDate: string;
    customerName: string;
    customerPhone: string | null;
    customerAddress: string | null;
    totalPrice: string;
    currency: string;
    paymentType: string | null;
    locationName: string;
  }>;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

function formatAmount(price: string, currency: string) {
  const n = parseFloat(price);
  return Number.isNaN(n)
    ? price
    : `${n.toLocaleString("en-LK", { minimumFractionDigits: 2 })} ${currency}`;
}

function formatPayment(raw: string | null) {
  if (!raw) return "—";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateDispatchGroupPdf(
  group: DispatchGroupForPdf,
  dateFrom: string,
  dateTo: string,
): Promise<Buffer> {
  const typeLabel = group.dispatchType === "rider" ? "Rider" : "Courier";
  const currency = group.orders[0]?.currency ?? "LKR";
  const totalAmount = group.orders.reduce((sum, o) => sum + parseFloat(o.totalPrice || "0"), 0);
  const dateLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;

  // Location totals
  const locationMap = new Map<string, { orders: number; total: number }>();
  for (const order of group.orders) {
    const loc = order.locationName;
    const prev = locationMap.get(loc) ?? { orders: 0, total: 0 };
    locationMap.set(loc, { orders: prev.orders + 1, total: prev.total + parseFloat(order.totalPrice || "0") });
  }

  const tableBody: unknown[][] = [
    [
      { text: "Order #", style: "th" },
      { text: "Date", style: "th" },
      { text: "Customer", style: "th" },
      { text: "Location", style: "th" },
      { text: "Amount", style: "th" },
      { text: "Payment", style: "th" },
    ],
    ...group.orders.map((order) => [
      { text: order.reference, style: "td" },
      { text: formatDate(order.orderDate), style: "td" },
      {
        stack: [
          { text: order.customerName, style: "td" },
          ...(order.customerPhone ? [{ text: order.customerPhone, style: "cellSub" }] : []),
          ...(order.customerAddress ? [{ text: order.customerAddress, style: "cellSub" }] : []),
        ],
      },
      { text: order.locationName, style: "td" },
      { text: formatAmount(order.totalPrice, order.currency), style: "td" },
      { text: formatPayment(order.paymentType), style: "td" },
    ]),
    [
      { text: `Total: ${group.orders.length} order${group.orders.length !== 1 ? "s" : ""}`, colSpan: 4, style: "total" },
      { text: "" },
      { text: "" },
      { text: "" },
      { text: formatAmount(totalAmount.toFixed(2), currency), style: "total" },
      { text: "" },
    ],
  ];

  const locationBody: unknown[][] = [
    [
      { text: "Location", style: "th" },
      { text: "Orders", style: "th" },
      { text: "Total", style: "th" },
    ],
    ...Array.from(locationMap.entries()).map(([loc, stats]) => [
      { text: loc, style: "td" },
      { text: String(stats.orders), style: "td" },
      { text: formatAmount(stats.total.toFixed(2), currency), style: "td" },
    ]),
    [
      { text: "Grand Total", style: "total" },
      { text: String(group.orders.length), style: "total" },
      { text: formatAmount(totalAmount.toFixed(2), currency), style: "total" },
    ],
  ];

  const tableLayout = {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0,
    hLineColor: () => "#cbd5e1",
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 5,
    paddingBottom: () => 5,
  };

  const docDef = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [30, 40, 30, 40],
    content: [
      {
        columns: [
          { text: "Dispatch Summary", style: "title", width: "*" },
          {
            stack: [
              { text: dateLabel, style: "headerSub" },
              { text: `${typeLabel}: ${group.dispatcherName}`, style: "subtitle" },
            ],
            width: "auto",
          },
        ],
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: ["auto", "auto", "*", "auto", "auto", "auto"],
          body: tableBody,
        },
        layout: {
          ...tableLayout,
          fillColor: (i: number) =>
            i === 0 ? "#1e40af" : i === tableBody.length - 1 ? "#f1f5f9" : i % 2 === 0 ? "#f8fafc" : null,
        },
      },
      { text: "Location Breakdown", style: "sectionHeader", margin: [0, 16, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: ["*", "auto", "auto"],
          body: locationBody,
        },
        layout: {
          ...tableLayout,
          fillColor: (i: number) =>
            i === 0 ? "#1e40af" : i === locationBody.length - 1 ? "#f1f5f9" : null,
        },
      },
    ],
    styles: {
      title: { fontSize: 18, bold: true, color: "#0f172a" },
      subtitle: { fontSize: 10, bold: true, color: "#1e40af", alignment: "right" },
      sectionHeader: { fontSize: 10, bold: true, color: "#0f172a" },
      headerSub: { fontSize: 8, color: "#64748b", alignment: "right" },
      th: { fontSize: 9, bold: true, color: "#ffffff" },
      td: { fontSize: 9, color: "#0f172a" },
      cellSub: { fontSize: 8, color: "#64748b" },
      total: { fontSize: 9, bold: true, color: "#0f172a" },
    },
    defaultStyle: { font: "Roboto" },
  };

  return pdfMake.createPdf(docDef).getBuffer();
}
