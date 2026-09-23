import {
  escapeEmailHtml,
  renderEmailTemplatePlaceholders,
} from "@/lib/email-templates/render";
import { formatAppDateShort, formatAppDateTimeShort } from "@/lib/format-datetime";
import type { StockPriceMissingGap } from "@/lib/stock-price-missing/gap";

export type StockPriceMissingLocationStock = {
  locationLabel: string;
  stock: number;
};

export type StockPriceMissingRow = {
  sku: string;
  itemName: string;
  locations: StockPriceMissingLocationStock[];
  totalStock: number;
  standardRate: string | null;
  ogfRate: string | null;
  gap: StockPriceMissingGap;
};

export type StockPriceMissingErpSection = {
  label: string;
  rows: StockPriceMissingRow[];
  missingStandardCount: number;
  missingOgfCount: number;
  missingBothCount: number;
};

export type StockPriceMissingScanSummary = {
  companyId: string;
  erp1: StockPriceMissingErpSection;
  erp2: StockPriceMissingErpSection;
};

export function formatLocationsCell(locations: StockPriceMissingLocationStock[]): string {
  if (locations.length === 0) return "—";
  return locations.map((l) => `${l.locationLabel}: ${l.stock}`).join(", ");
}

function rateCell(rate: string | null): string {
  return rate ? escapeEmailHtml(rate) : "<strong>Missing</strong>";
}

function buildErpTableHtml(
  section: StockPriceMissingErpSection,
  emptyMessage: string,
): string {
  if (section.rows.length === 0) {
    return `<p>${escapeEmailHtml(emptyMessage)}</p>`;
  }

  const body = section.rows
    .map((row, index) => {
      return `<tr>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${index + 1}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(row.sku)}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(row.itemName)}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(formatLocationsCell(row.locations))}</td>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${row.totalStock}</td>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${rateCell(row.standardRate)}</td>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${rateCell(row.ogfRate)}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(row.gap)}</td>
</tr>`;
    })
    .join("");

  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
<thead>
<tr>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">#</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">SKU</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Item name</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Locations (stock)</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Stock</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Standard Selling</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">OGF</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Gap</th>
</tr>
</thead>
<tbody>${body}</tbody>
</table>`;
}

export function buildStockPriceMissingEmailContent(input: {
  companyName: string;
  scan: StockPriceMissingScanSummary;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  now?: Date;
}): { subject: string; html: string; plain: string } {
  const now = input.now ?? new Date();
  const reportDate = formatAppDateShort(now);
  const generatedAt = formatAppDateTimeShort(now);
  const itemCount = String(input.scan.erp1.rows.length + input.scan.erp2.rows.length);

  const vars: Record<string, string> = {
    companyName: escapeEmailHtml(input.companyName),
    reportDate,
    generatedAt,
    itemCount,
    erp1Label: escapeEmailHtml(input.scan.erp1.label),
    erp2Label: escapeEmailHtml(input.scan.erp2.label),
    erp1Count: String(input.scan.erp1.rows.length),
    erp2Count: String(input.scan.erp2.rows.length),
    erp1MissingStandardCount: String(input.scan.erp1.missingStandardCount),
    erp1MissingOgfCount: String(input.scan.erp1.missingOgfCount),
    erp1MissingBothCount: String(input.scan.erp1.missingBothCount),
    erp2MissingStandardCount: String(input.scan.erp2.missingStandardCount),
    erp2MissingOgfCount: String(input.scan.erp2.missingOgfCount),
    erp2MissingBothCount: String(input.scan.erp2.missingBothCount),
    erp1TableHtml: buildErpTableHtml(
      input.scan.erp1,
      "No ERP1 items with Standard / OGF gap.",
    ),
    erp2TableHtml: buildErpTableHtml(
      input.scan.erp2,
      "No ERP2 items with Standard / OGF gap.",
    ),
    /** Legacy placeholders — keep filled so older saved templates still render. */
    missingBothCount: String(input.scan.erp1.missingBothCount),
    missingStandardCount: String(input.scan.erp1.missingStandardCount),
    missingOgfCount: String(input.scan.erp1.missingOgfCount),
    erp2OgfMissingCount: String(input.scan.erp2.missingOgfCount),
    itemTableHtml: buildErpTableHtml(
      input.scan.erp1,
      "No ERP1 items with Standard / OGF gap.",
    ),
    erp2OgfMissingTableHtml: buildErpTableHtml(
      input.scan.erp2,
      "No ERP2 items with Standard / OGF gap.",
    ),
  };

  const subjectVars: Record<string, string> = {
    ...vars,
    companyName: input.companyName,
    erp1Label: input.scan.erp1.label,
    erp2Label: input.scan.erp2.label,
  };

  const subject = renderEmailTemplatePlaceholders(input.subjectTemplate, subjectVars);
  const html = renderEmailTemplatePlaceholders(input.bodyHtmlTemplate, vars);
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return { subject, html, plain };
}
