type RenderScope = Record<string, unknown>;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPath(scope: RenderScope, path: string): unknown {
  const trimmed = path.trim();
  if (trimmed === "this" || trimmed === ".") return scope.this ?? scope;

  const parts = trimmed.split(".").filter(Boolean);
  let current: unknown = scope;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function renderSection(template: string, scope: RenderScope): string {
  let output = template.replace(
    /{{#each\s+([^}]+)}}([\s\S]*?){{\/each}}/g,
    (_match, path: string, block: string) => {
      const value = getPath(scope, path);
      if (!Array.isArray(value)) return "";
      return value
        .map((item, index) =>
          renderSection(block, {
            ...scope,
            this: item,
            index: index + 1,
            ...(item && typeof item === "object" ? (item as RenderScope) : {}),
          }),
        )
        .join("");
    },
  );

  output = output.replace(
    /{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g,
    (_match, path: string, block: string) => (isTruthy(getPath(scope, path)) ? renderSection(block, scope) : ""),
  );

  output = output.replace(/{{{\s*([^}]+)\s*}}}/g, (_match, path: string) => String(getPath(scope, path) ?? ""));
  output = output.replace(/{{\s*([^#/][^}]*)\s*}}/g, (_match, path: string) => escapeHtml(getPath(scope, path)));

  return output;
}

/**
 * Existing Cosmo invoice formats only print Grand Total. For cash splits,
 * insert invoice total + prepaid rows so Grand Total can be the cash due.
 */
export function injectCashSplitPrepaidInvoiceRows(template: string): string {
  if (template.includes("{{totals.prepaidFormatted}}")) return template;

  const tableRow = template.replace(
    /(<tr\b[^>]*>\s*<td\b[^>]*>\s*Grand Total\s*<\/td>\s*<td\b[^>]*>\s*\{\{\s*totals\.grandTotalFormatted\s*\}\}\s*<\/td>\s*<\/tr>)/i,
    `{{#if totals.prepaidFormatted}}
        <tr>
          <td class="label">Invoice Total</td>
          <td class="amount">{{totals.invoiceTotalFormatted}}</td>
        </tr>
        <tr>
          <td class="label">{{totals.prepaidLabel}} Paid</td>
          <td class="amount">- {{totals.prepaidFormatted}}</td>
        </tr>
        {{/if}}
        $1`,
  );
  if (tableRow !== template) return tableRow;

  return template.replace(
    /(<h[1-6]\b[^>]*>\s*Grand Total:\s*\{\{\s*totals\.grandTotalFormatted\s*\}\}\s*<\/h[1-6]>)/i,
    `{{#if totals.prepaidFormatted}}
  <p class="right">Invoice Total: {{totals.invoiceTotalFormatted}}</p>
  <p class="right">{{totals.prepaidLabel}} Paid: - {{totals.prepaidFormatted}}</p>
  {{/if}}
  $1`,
  );
}

export function renderPrintFormatHtml(template: string, context: RenderScope): string {
  return renderSection(injectCashSplitPrepaidInvoiceRows(template), context);
}
