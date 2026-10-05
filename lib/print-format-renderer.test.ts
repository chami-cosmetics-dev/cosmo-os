import { describe, expect, it } from "vitest";

import {
  injectCashSplitPrepaidInvoiceRows,
  renderPrintFormatHtml,
} from "@/lib/print-format-renderer";

const TABLE_TEMPLATE = `
      <table class="totals">
        <tr>
          <td class="label">Total</td>
          <td class="amount">{{totals.productTotalFormatted}}</td>
        </tr>
        <tr>
          <td class="label">Shipping Charges</td>
          <td class="amount">{{totals.shippingTotalFormatted}}</td>
        </tr>
        <tr class="grand-total">
          <td class="label">Grand Total</td>
          <td class="amount">{{totals.grandTotalFormatted}}</td>
        </tr>
      </table>
`;

const HEADING_TEMPLATE = `<h2 class="right">Grand Total: {{totals.grandTotalFormatted}}</h2>`;

describe("cash-split invoice prepaid rows", () => {
  it("injects invoice total and prepaid rows before Grand Total", () => {
    const injected = injectCashSplitPrepaidInvoiceRows(TABLE_TEMPLATE);
    expect(injected).toContain("{{#if totals.prepaidFormatted}}");
    expect(injected).toContain("Invoice Total");
    expect(injected).toContain("{{totals.prepaidLabel}} Paid");
    expect(injected).toContain("- {{totals.prepaidFormatted}}");
    expect(injected.indexOf("Invoice Total")).toBeLessThan(injected.indexOf("Grand Total"));
  });

  it("does not inject twice when template already has prepaid tokens", () => {
    const once = injectCashSplitPrepaidInvoiceRows(TABLE_TEMPLATE);
    expect(injectCashSplitPrepaidInvoiceRows(once)).toBe(once);
  });

  it("prints cash due as Grand Total and hides prepaid rows when none", () => {
    const html = renderPrintFormatHtml(TABLE_TEMPLATE, {
      totals: {
        productTotalFormatted: "Rs 19,650.00",
        shippingTotalFormatted: "Rs 400.00",
        invoiceTotalFormatted: "Rs 20,050.00",
        prepaidLabel: "",
        prepaidFormatted: "",
        grandTotalFormatted: "Rs 20,050.00",
      },
    });
    expect(html).not.toContain("Invoice Total");
    expect(html).toContain("Grand Total");
    expect(html).toContain("Rs 20,050.00");
  });

  it("shows invoice 20050 minus KOKO 5000 as Grand Total 15050", () => {
    const html = renderPrintFormatHtml(TABLE_TEMPLATE, {
      totals: {
        productTotalFormatted: "Rs 19,650.00",
        shippingTotalFormatted: "Rs 400.00",
        invoiceTotalFormatted: "Rs 20,050.00",
        prepaidLabel: "KOKO",
        prepaidFormatted: "Rs 5,000.00",
        grandTotalFormatted: "Rs 15,050.00",
      },
    });
    expect(html).toContain("Invoice Total");
    expect(html).toContain("Rs 20,050.00");
    expect(html).toContain("KOKO Paid");
    expect(html).toContain("- Rs 5,000.00");
    expect(html).toContain("Grand Total");
    expect(html).toContain("Rs 15,050.00");
  });

  it("injects heading formats used by the starter template", () => {
    const html = renderPrintFormatHtml(HEADING_TEMPLATE, {
      totals: {
        invoiceTotalFormatted: "Rs 20,050.00",
        prepaidLabel: "KOKO",
        prepaidFormatted: "Rs 5,000.00",
        grandTotalFormatted: "Rs 15,050.00",
      },
    });
    expect(html).toContain("Invoice Total: Rs 20,050.00");
    expect(html).toContain("KOKO Paid: - Rs 5,000.00");
    expect(html).toContain("Grand Total: Rs 15,050.00");
  });
});
