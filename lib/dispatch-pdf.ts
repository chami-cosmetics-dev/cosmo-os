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

// One-time setup: register fonts in the virtual FS
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
// Block external URL and local FS access — we only use virtual FS fonts
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => false);

export type DispatchGroupForPdf = {
  dispatcherName: string;
  dispatchType: "rider" | "courier";
  orders: Array<{
    reference: string;
    customerName: string;
    customerPhone: string | null;
    totalPrice: string;
    currency: string;
    financialStatus: string | null;
    dispatchedAt: string;
    items: Array<{ title: string; qty: number }>;
  }>;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
}

function formatAmount(price: string, currency: string) {
  const n = parseFloat(price);
  return Number.isNaN(n)
    ? price
    : `${n.toLocaleString("en-LK", { minimumFractionDigits: 2 })} ${currency}`;
}

export async function generateDispatchGroupPdf(
  group: DispatchGroupForPdf,
  date: string,
): Promise<Buffer> {
  const typeLabel = group.dispatchType === "rider" ? "Rider" : "Courier";
  const currency = group.orders[0]?.currency ?? "LKR";
  const totalAmount = group.orders.reduce(
    (sum, o) => sum + parseFloat(o.totalPrice || "0"),
    0,
  );

  // pdfmake table body — typed as unknown[][] to avoid fighting the library's types
  const tableBody: unknown[][] = [
    // header row
    [
      { text: "Order #", style: "th" },
      { text: "Customer", style: "th" },
      { text: "Items", style: "th" },
      { text: "Amount", style: "th" },
      { text: "Payment", style: "th" },
      { text: "Time", style: "th" },
    ],
    // data rows
    ...group.orders.map((order) => [
      { text: order.reference, style: "td" },
      {
        stack: [
          { text: order.customerName, style: "td" },
          ...(order.customerPhone
            ? [{ text: order.customerPhone, style: "sub" }]
            : []),
        ],
      },
      {
        stack: order.items.map((item) => ({
          text: item.qty > 1 ? `${item.qty}× ${item.title}` : item.title,
          style: "sub",
        })),
      },
      { text: formatAmount(order.totalPrice, order.currency), style: "td" },
      { text: order.financialStatus ?? "—", style: "td" },
      { text: formatTime(order.dispatchedAt), style: "td" },
    ]),
    // totals row
    [
      {
        text: `Total: ${group.orders.length} order${group.orders.length !== 1 ? "s" : ""}`,
        colSpan: 3,
        style: "total",
      },
      { text: "" },
      { text: "" },
      { text: formatAmount(totalAmount.toFixed(2), currency), style: "total" },
      { text: "" },
      { text: "" },
    ],
  ];

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
              { text: date, style: "sub" },
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
          widths: ["auto", "*", "*", "auto", "auto", "auto"],
          body: tableBody,
        },
        layout: {
          fillColor: (i: number) =>
            i === 0
              ? "#1e40af"
              : i === tableBody.length - 1
                ? "#f1f5f9"
                : i % 2 === 0
                  ? "#f8fafc"
                  : null,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => "#cbd5e1",
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },
    ],
    styles: {
      title: { fontSize: 18, bold: true, color: "#0f172a" },
      subtitle: { fontSize: 10, bold: true, color: "#1e40af", alignment: "right" },
      sub: { fontSize: 8, color: "#64748b", alignment: "right" },
      th: { fontSize: 9, bold: true, color: "#ffffff" },
      td: { fontSize: 9, color: "#0f172a" },
      total: { fontSize: 9, bold: true, color: "#0f172a" },
    },
    defaultStyle: { font: "Roboto" },
  };

  return pdfMake.createPdf(docDef).getBuffer();
}
