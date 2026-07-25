import { describe, expect, it } from "vitest";

import { resolveInvoicePrintMode } from "@/lib/invoice-print-mode";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe("resolveInvoicePrintMode", () => {
  it("returns view with no autoPrint when no query", () => {
    expect(resolveInvoicePrintMode(params(""))).toEqual({
      mode: "view",
      shouldIncrementPrint: false,
      autoPrint: false,
    });
  });

  it("treats preview=1 as view-only print", () => {
    expect(resolveInvoicePrintMode(params("preview=1"))).toEqual({
      mode: "preview",
      shouldIncrementPrint: false,
      autoPrint: true,
    });
  });

  it("treats preview=true as view-only print", () => {
    expect(resolveInvoicePrintMode(params("preview=true"))).toEqual({
      mode: "preview",
      shouldIncrementPrint: false,
      autoPrint: true,
    });
  });

  it("treats print=preview as view-only print", () => {
    expect(resolveInvoicePrintMode(params("print=preview"))).toEqual({
      mode: "preview",
      shouldIncrementPrint: false,
      autoPrint: true,
    });
  });

  it("treats print=1 as formal print", () => {
    expect(resolveInvoicePrintMode(params("print=1"))).toEqual({
      mode: "formal",
      shouldIncrementPrint: true,
      autoPrint: true,
    });
  });

  it("treats print=true as formal print", () => {
    expect(resolveInvoicePrintMode(params("print=true"))).toEqual({
      mode: "formal",
      shouldIncrementPrint: true,
      autoPrint: true,
    });
  });

  it("prefers preview over formal when both present", () => {
    expect(resolveInvoicePrintMode(params("preview=1&print=1"))).toEqual({
      mode: "preview",
      shouldIncrementPrint: false,
      autoPrint: true,
    });
  });
});
