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

export type StockPriceMissingScanSummary = {
  companyId: string;
  /** Both ERPs stock, no Standard and no OGF. */
  rows: StockPriceMissingRow[];
  /** ERP2 stock, has Standard, missing OGF, non-VAT. */
  erp2OgfMissingRows: StockPriceMissingRow[];
  missingStandardCount: number;
  missingOgfCount: number;
  missingBothCount: number;
  erp2OgfMissingCount: number;
};

export function formatLocationsCell(locations: StockPriceMissingLocationStock[]): string {
  if (locations.length === 0) return "—";
  return locations.map((l) => `${l.locationLabel}: ${l.stock}`).join(", ");
}

function buildNoSellingPriceTableHtml(rows: StockPriceMissingRow[]): string {
  if (rows.length === 0) {
    return `<p>No items matched (stock in both ERPs with no selling price list).</p>`;
  }

  const body = rows
    .map((row, index) => {
      return `<tr>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${index + 1}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(row.sku)}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(row.itemName)}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(formatLocationsCell(row.locations))}</td>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${row.totalStock}</td>
  <td style="padding:6px;border:1px solid #ddd"><strong>Missing</strong></td>
  <td style="padding:6px;border:1px solid #ddd"><strong>Missing</strong></td>
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
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Total</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Standard Selling</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">OGF</th>
</tr>
</thead>
<tbody>${body}</tbody>
</table>`;
}

function buildErp2OgfMissingTableHtml(rows: StockPriceMissingRow[]): string {
  if (rows.length === 0) {
    return `<p>No items matched (ERP2 stock, Standard present, OGF missing, non-VAT).</p>`;
  }

  const body = rows
    .map((row, index) => {
      const standardCell = row.standardRate
        ? escapeEmailHtml(row.standardRate)
        : "<strong>Missing</strong>";
      return `<tr>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${index + 1}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(row.sku)}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(row.itemName)}</td>
  <td style="padding:6px;border:1px solid #ddd">${escapeEmailHtml(formatLocationsCell(row.locations))}</td>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${row.totalStock}</td>
  <td style="padding:6px;border:1px solid #ddd;text-align:right">${standardCell}</td>
  <td style="padding:6px;border:1px solid #ddd"><strong>Missing</strong></td>
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
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">ERP2 stock</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">Standard Selling</th>
  <th style="padding:6px;border:1px solid #ddd;background:#f5f5f5">OGF</th>
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
  const totalItems = input.scan.rows.length + input.scan.erp2OgfMissingRows.length;
  const vars: Record<string, string> = {
    companyName: escapeEmailHtml(input.companyName),
    reportDate,
    generatedAt,
    itemCount: String(totalItems),
    missingStandardCount: String(input.scan.missingStandardCount),
    missingOgfCount: String(input.scan.missingOgfCount),
    missingBothCount: String(input.scan.missingBothCount),
    erp2OgfMissingCount: String(input.scan.erp2OgfMissingCount),
    itemTableHtml: buildNoSellingPriceTableHtml(input.scan.rows),
    erp2OgfMissingTableHtml: buildErp2OgfMissingTableHtml(input.scan.erp2OgfMissingRows),
  };

  const subjectVars: Record<string, string> = {
    ...vars,
    companyName: input.companyName,
  };

  const subject = renderEmailTemplatePlaceholders(input.subjectTemplate, subjectVars);
  const html = renderEmailTemplatePlaceholders(input.bodyHtmlTemplate, vars);
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return { subject, html, plain };
}
