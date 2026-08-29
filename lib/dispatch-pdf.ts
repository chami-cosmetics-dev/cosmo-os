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

import { isCitypakCourier } from "@/lib/courier";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { formatAppIsoDate } from "@/lib/format-datetime";

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
    merchantStaffName: string | null;
    merchantNumber: string | null;
    merchantContactPhone: string | null;
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

function formatDate(iso: string) {
  return formatAppIsoDate(iso, "-");
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
  if (
    normalized.includes("card on delivery") ||
    normalized.includes("card payment on delivery") ||
    normalized.includes("card")
  ) {
    return "CARD ON DEL";
  }
  if (normalized.includes("koko")) return "KOKO";
  if (normalized.includes("mintpay")) return "MINTPAY";
  if (normalized.includes("bank")) return "BANK TRANSFER";
  return raw.replace(/[_-]+/g, " ").toUpperCase();
}

function dispatchHandlerLabel(type: DispatchGroupForPdf["dispatchType"]) {
  if (type === "rider") return "Rider";
  if (type === "courier") return "Courier";
  return "Handler";
}

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

function formatMultilineCell(...parts: Array<string | null | undefined>) {
  const lines = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part !== "-"));
  return lines.length > 0 ? lines.join("\n") : "-";
}

function formatCustomerCell(order: DispatchGroupForPdf["orders"][number]) {
  return formatMultilineCell(order.customerName, order.customerPhone);
}

function formatMerchantCell(order: DispatchGroupForPdf["orders"][number]) {
  const formatted = formatMultilineCell(
    order.merchantStaffName,
    order.merchantNumber,
    order.merchantContactPhone,
  );
  if (formatted !== "-") return formatted;
  return order.merchantName ?? "-";
}

function usesCitypakSummary(group: DispatchGroupForPdf) {
  return (
    !isVaultOsDeployment() &&
    group.dispatchType === "courier" &&
    isCitypakCourier(group.dispatcherName)
  );
}

async function generateLegacyDispatchPdf(
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

      const baseRow: unknown[] = [
        { text: String(index + 1), style: "td", alignment: "center" },
        { text: order.locationName, style: "td" },
        { text: formatDate(order.dispatchedAt), style: "td" },
        { text: invLines.join("\n"), style: "emphasisTd" },
        { text: formatPayment(order.paymentType), style: "td" },
        { text: order.city ?? "-", style: "td" },
        { text: order.address ?? "-", style: "td" },
        { text: order.customerPhone ?? "-", style: "emphasisTd" },
      ];
      if (isRider) {
        baseRow.push({ text: order.customerName ?? "-", style: "td" });
      }
      baseRow.push(
        { text: formatMerchantCell(order), style: "merchantTd" },
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
            ? [22, 65, 55, 66, 68, 55, 108, 60, 72, 60, 78]
            : [22, 78, 62, 68, 76, 66, 132, 68, 72, 82],
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
      th: { fontSize: 9, bold: true, color: "#000000" },
      td: { fontSize: 9, color: "#111111" },
      emphasisTd: { fontSize: 10, color: "#000000" },
      merchantTd: { fontSize: 8, color: "#111111" },
      totalLabel: { fontSize: 9, bold: true, color: "#000000" },
      totalAmount: { fontSize: 10, bold: true, color: "#000000" },
    },
    footer: {
      text: `${dateLabel} | ${group.dispatcherName}`,
      alignment: "right",
      margin: [0, 0, 22, 0],
      fontSize: 7,
      color: "#333333",
    },
    defaultStyle: { font: "Roboto" },
  };

  return pdfMake.createPdf(docDef).getBuffer();
}

async function generateCitypakDispatchPdf(
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
      { text: formatCustomerCell(order), style: "td" },
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
            text: `Courier: ${group.dispatcherName}`,
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

export async function generateDispatchGroupPdf(
  group: DispatchGroupForPdf,
  dateFrom: string,
  dateTo: string,
): Promise<Buffer> {
  if (usesCitypakSummary(group)) {
    return generateCitypakDispatchPdf(group, dateFrom, dateTo);
  }
  return generateLegacyDispatchPdf(group, dateFrom, dateTo);
}
