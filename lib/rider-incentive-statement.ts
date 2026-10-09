import { Prisma } from "@prisma/client";

import { escapeCsvCell } from "@/lib/reports/csv";

export type IncentiveStatementLine = {
  date: string;
  orderNumber: string;
  invoiceNumber: string;
  deliveryStatus: string;
  invoiceStatus: "Complete" | "Open";
  shippingCost: string;
  riderPayment: string;
  unmatched: boolean;
};

export type IncentiveStatementCompany = {
  company: string;
  orders: IncentiveStatementLine[];
  shippingTotal: string;
  riderPaymentTotal: string;
};

export type IncentiveStatementInput = {
  date: string;
  orderNumber: string;
  invoiceNumber: string;
  company: string;
  deliveryStatus: string;
  invoiceStatus: "Complete" | "Open";
  shippingCost: Prisma.Decimal | number | string;
  riderPayment: Prisma.Decimal | number | string;
  unmatched: boolean;
};

function money(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value.toString());
}

export function incentiveExportBlockReason(unmatchedCount: number): string | null {
  if (unmatchedCount <= 0) return null;
  const label = unmatchedCount === 1 ? "order" : "orders";
  return `Finish ${unmatchedCount} unmatched ${label} before export`;
}

export function groupIncentiveStatement(rows: IncentiveStatementInput[]): {
  companies: IncentiveStatementCompany[];
  shippingTotal: string;
  riderPaymentTotal: string;
  unmatchedCount: number;
} {
  const byCompany = new Map<string, IncentiveStatementInput[]>();
  let shipping = new Prisma.Decimal(0);
  let riderPay = new Prisma.Decimal(0);
  let unmatchedCount = 0;

  for (const row of rows) {
    const company = row.company.trim() || "Unknown";
    const list = byCompany.get(company) ?? [];
    list.push({ ...row, company });
    byCompany.set(company, list);
    shipping = shipping.add(money(row.shippingCost));
    riderPay = riderPay.add(money(row.riderPayment));
    if (row.unmatched) unmatchedCount += 1;
  }

  const companies = [...byCompany.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([company, orders]) => {
      const sorted = [...orders].sort(
        (a, b) => a.date.localeCompare(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber),
      );
      let companyShip = new Prisma.Decimal(0);
      let companyPay = new Prisma.Decimal(0);
      const lines: IncentiveStatementLine[] = sorted.map((order) => {
        companyShip = companyShip.add(money(order.shippingCost));
        companyPay = companyPay.add(money(order.riderPayment));
        return {
          date: order.date,
          orderNumber: order.orderNumber,
          invoiceNumber: order.invoiceNumber,
          deliveryStatus: order.deliveryStatus,
          invoiceStatus: order.invoiceStatus,
          shippingCost: money(order.shippingCost).toFixed(2),
          riderPayment: money(order.riderPayment).toFixed(2),
          unmatched: order.unmatched,
        };
      });
      return {
        company,
        orders: lines,
        shippingTotal: companyShip.toFixed(2),
        riderPaymentTotal: companyPay.toFixed(2),
      };
    });

  return {
    companies,
    shippingTotal: shipping.toFixed(2),
    riderPaymentTotal: riderPay.toFixed(2),
    unmatchedCount,
  };
}

const CSV_HEADERS = [
  "Rider",
  "Date",
  "Order number",
  "Invoice number",
  "Company",
  "Delivery status",
  "Invoice status",
  "Shipping cost",
  "Rider payment",
] as const;

export function incentiveStatementCsv(input: {
  riderName: string;
  companies: IncentiveStatementCompany[];
  shippingTotal: string;
  riderPaymentTotal: string;
}): string {
  const lines = [CSV_HEADERS.map((header) => escapeCsvCell(header)).join(",")];
  for (const company of input.companies) {
    for (const order of company.orders) {
      lines.push(
        [
          input.riderName,
          order.date,
          order.orderNumber,
          order.invoiceNumber,
          company.company,
          order.deliveryStatus,
          order.invoiceStatus,
          order.shippingCost,
          order.riderPayment,
        ]
          .map((cell) => escapeCsvCell(cell))
          .join(","),
      );
    }
    lines.push(
      ["", "", "", "", company.company, "", "Company total", company.shippingTotal, company.riderPaymentTotal]
        .map((cell) => escapeCsvCell(cell))
        .join(","),
    );
  }
  lines.push(
    ["", "", "", "", "", "", "Full total", input.shippingTotal, input.riderPaymentTotal]
      .map((cell) => escapeCsvCell(cell))
      .join(","),
  );
  return `\uFEFF${lines.join("\r\n")}`;
}
