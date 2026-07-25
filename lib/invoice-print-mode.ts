export type InvoicePrintMode = "view" | "preview" | "formal";

export type ResolvedInvoicePrintMode = {
  mode: InvoicePrintMode;
  shouldIncrementPrint: boolean;
  autoPrint: boolean;
};

/**
 * Resolve invoice GET query into view / view-only print / formal print.
 * @see specs/024-print-invoice-view/contracts/invoice-print-modes.md
 */
export function resolveInvoicePrintMode(
  searchParams: URLSearchParams | { get(name: string): string | null }
): ResolvedInvoicePrintMode {
  const printParam = searchParams.get("print");
  const previewParam = searchParams.get("preview");

  const isPreview =
    previewParam === "1" ||
    previewParam === "true" ||
    printParam === "preview";

  if (isPreview) {
    return { mode: "preview", shouldIncrementPrint: false, autoPrint: true };
  }

  const isFormal = printParam === "1" || printParam === "true";
  if (isFormal) {
    return { mode: "formal", shouldIncrementPrint: true, autoPrint: true };
  }

  return { mode: "view", shouldIncrementPrint: false, autoPrint: false };
}
