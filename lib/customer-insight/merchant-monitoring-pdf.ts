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

import { formatAppDateTime } from "@/lib/format-datetime";
import type { MerchantMonitoringReport } from "@/lib/customer-insight/merchant-monitoring";
import { PURCHASE_RECENCY_BUCKET_ORDER } from "@/lib/customer-insight/merchant-monitoring-recency";

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

function portfolioTable(report: MerchantMonitoringReport) {
  const header = [
    { text: "Merchant", style: "tableHeader" },
    { text: "Alloc", style: "tableHeader", alignment: "right" },
    { text: "Gold", style: "tableHeader", alignment: "right" },
    { text: "Plat", style: "tableHeader", alignment: "right" },
    { text: "Std", style: "tableHeader", alignment: "right" },
    { text: "DOB %", style: "tableHeader", alignment: "right" },
    { text: "Email %", style: "tableHeader", alignment: "right" },
    { text: "Bought", style: "tableHeader", alignment: "right" },
  ];
  const body = report.portfolioRows.map((row) => [
    row.merchantLabel,
    { text: String(row.allocatedTotal), alignment: "right" },
    { text: String(row.tiers.gold), alignment: "right" },
    { text: String(row.tiers.platinum), alignment: "right" },
    { text: String(row.tiers.standard), alignment: "right" },
    { text: String(row.dobCompletePercent), alignment: "right" },
    { text: String(row.emailCompletePercent), alignment: "right" },
    { text: String(row.purchasedInPeriodCount), alignment: "right" },
  ]);
  const company = report.companyPortfolio;
  body.push([
    { text: company.merchantLabel, bold: true },
    { text: String(company.allocatedTotal), alignment: "right", bold: true },
    { text: String(company.tiers.gold), alignment: "right", bold: true },
    { text: String(company.tiers.platinum), alignment: "right", bold: true },
    { text: String(company.tiers.standard), alignment: "right", bold: true },
    { text: String(company.dobCompletePercent), alignment: "right", bold: true },
    { text: String(company.emailCompletePercent), alignment: "right", bold: true },
    { text: String(company.purchasedInPeriodCount), alignment: "right", bold: true },
  ]);
  return {
    table: {
      headerRows: 1,
      widths: ["*", 32, 28, 28, 28, 32, 36, 36],
      body: [header, ...body],
    },
    layout: "lightHorizontalLines",
    margin: [0, 8, 0, 16] as [number, number, number, number],
  };
}

function recencyTable(report: MerchantMonitoringReport) {
  const header = [
    { text: "Bucket", style: "tableHeader" },
    { text: "Gold", style: "tableHeader", alignment: "right" },
    { text: "Plat", style: "tableHeader", alignment: "right" },
    { text: "Std", style: "tableHeader", alignment: "right" },
    { text: "Total", style: "tableHeader", alignment: "right" },
  ];
  const body = PURCHASE_RECENCY_BUCKET_ORDER.map((bucket) => {
    const row = report.companyRecency.find((b) => b.bucket === bucket);
    const tiers = row?.tiers ?? { gold: 0, platinum: 0, standard: 0, total: 0 };
    return [
      row?.label ?? bucket,
      { text: String(tiers.gold), alignment: "right" },
      { text: String(tiers.platinum), alignment: "right" },
      { text: String(tiers.standard), alignment: "right" },
      { text: String(tiers.total), alignment: "right" },
    ];
  });
  return {
    table: {
      headerRows: 1,
      widths: ["*", 36, 36, 36, 40],
      body: [header, ...body],
    },
    layout: "lightHorizontalLines",
    margin: [0, 0, 0, 0] as [number, number, number, number],
  };
}

export async function generateMerchantMonitoringPdf(
  report: MerchantMonitoringReport,
  companyName?: string | null
): Promise<Buffer> {
  const doc = {
    pageOrientation: "landscape" as const,
    pageMargins: [24, 36, 24, 36] as [number, number, number, number],
    content: [
      {
        text: "Merchant monitoring",
        style: "title",
      },
      {
        text: [
          companyName ? `${companyName} · ` : "",
          report.period.periodLabel,
          ` (${report.period.fromYmd} – ${report.period.toYmd})`,
        ].join(""),
        style: "subtitle",
        margin: [0, 4, 0, 2] as [number, number, number, number],
      },
      {
        text: `Generated ${formatAppDateTime(report.generatedAt)}`,
        style: "meta",
        margin: [0, 0, 0, 12] as [number, number, number, number],
      },
      { text: "Portfolio", style: "section" },
      portfolioTable(report),
      { text: "Purchase recency (company)", style: "section" },
      recencyTable(report),
    ],
    styles: {
      title: { fontSize: 16, bold: true },
      subtitle: { fontSize: 10 },
      meta: { fontSize: 8, color: "#555555" },
      section: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
      tableHeader: { bold: true, fontSize: 8 },
    },
    defaultStyle: { fontSize: 8 },
  };

  return pdfMake.createPdf(doc).getBuffer();
}
