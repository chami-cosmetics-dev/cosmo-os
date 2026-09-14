import type { Worksheet } from "exceljs";

export type OsfWorkbookBandKey =
  | "identity"
  | "stock"
  | "rop"
  | "calc"
  | "order"
  | "price"
  | "cost"
  | "sales";

/** Header-band fills (ARGB hex without #) for ExcelJS — shared Cosmo + Vault OSF. */
export const OSF_WORKBOOK_BAND_COLORS: Record<
  OsfWorkbookBandKey,
  { header: string; section: string; totals: string; font: string }
> = {
  identity: { header: "5B6B7A", section: "D6DCE4", totals: "EEF1F4", font: "FFFFFF" },
  stock: { header: "2F75B5", section: "BDD7EE", totals: "DEEBF7", font: "FFFFFF" },
  rop: { header: "548235", section: "C6E0B4", totals: "E2EFDA", font: "FFFFFF" },
  calc: { header: "C65911", section: "F8CBAD", totals: "FCE4D6", font: "FFFFFF" },
  order: { header: "833C0C", section: "F4B183", totals: "F8CBAD", font: "FFFFFF" },
  price: { header: "7030A0", section: "D5A6E6", totals: "E2D5F1", font: "FFFFFF" },
  cost: { header: "0070C0", section: "9DC3E6", totals: "DDEBF7", font: "FFFFFF" },
  sales: { header: "BF8F00", section: "FFE699", totals: "FFF2CC", font: "000000" },
};

export type OsfWorkbookBandColumn = {
  header: string;
  section?: string;
  band?: OsfWorkbookBandKey;
};

/** Style rows 1–2 (section + header) with Cosmo OSF band colors. */
export function applyOsfWorkbookHeaderBands(
  ws: Worksheet,
  defs: OsfWorkbookBandColumn[],
): void {
  for (let colIdx = 0; colIdx < defs.length; colIdx += 1) {
    const band = defs[colIdx]!.band ?? "identity";
    const colors = OSF_WORKBOOK_BAND_COLORS[band];
    const excelCol = colIdx + 1;
    const styleRow = (rowNum: number, fillArgb: string, fontArgb: string, bold: boolean) => {
      const cell = ws.getRow(rowNum).getCell(excelCol);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${fillArgb}` },
      };
      cell.font = { bold, color: { argb: `FF${fontArgb}` }, size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
    };
    styleRow(1, colors.section, "000000", true);
    styleRow(2, colors.header, colors.font, true);
    const len = Math.max(10, Math.min(28, defs[colIdx]!.header.length + 2));
    ws.getColumn(excelCol).width = len;
  }
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 28;
}
