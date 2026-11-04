import * as ExcelJS from "exceljs";

type LayoutRow = { row: number; outlet: string; name: string; key: string; showroomTarget?: number | null; onlineTarget?: number | null; hidden?: boolean };
type LayoutSettings = Record<string, unknown> & { rows: LayoutRow[]; visitorBlock?: Record<string, unknown>; extraTargets?: Array<{ sheet: string; cell: string; value: number }> };

const label = (value: unknown) => String(value ?? "").trim().toLowerCase();
const addressRow = (address: string, at: number) => address.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (_, col: string, number: string) => col + (Number(number) >= at ? Number(number) + 1 : number));

function shiftSettings(settings: LayoutSettings, sheet: string, at: number) {
  if (sheet === "Merchant Wise") {
    for (const row of settings.rows) if (row.row >= at) row.row++;
    for (const key of ["homeRows", "slotRows", "totalRows"] as const) {
      const block = settings.visitorBlock as Record<string, unknown> | undefined;
      if (Array.isArray(block?.[key])) block![key] = (block![key] as number[]).map((n) => n >= at ? n + 1 : n);
    }
    if (typeof settings.checkRow === "number" && settings.checkRow >= at) settings.checkRow++;
  } else {
    const block = settings.visitorBlock as Record<string, unknown> | undefined;
    if (Array.isArray(block?.owTotalRows)) block!.owTotalRows = (block!.owTotalRows as number[]).map((n) => n >= at ? n + 1 : n);
    if (typeof settings.cosmoCell === "string") settings.cosmoCell = addressRow(settings.cosmoCell, at);
  }
  for (const target of settings.extraTargets ?? []) if (target.sheet === sheet) target.cell = addressRow(target.cell, at);
}

function shiftFormulas(workbook: ExcelJS.Workbook, sheet: string, at: number) {
  const reference = /(?:(('(?:Merchant Wise|Outlet Wise)'!))?)(\$?[A-Z]{1,3})(\$?)(\d+)/g;
  for (const ws of workbook.worksheets) ws.eachRow((row) => row.eachCell((cell) => {
    const value = cell.value;
    if (!value || typeof value !== "object" || !("formula" in value) || typeof value.formula !== "string") return;
    const formula = value.formula.replace(reference, (match, _whole, prefix: string | undefined, col: string, absolute: string, number: string) => {
      const target = prefix ? prefix.slice(1, -2) : ws.name;
      return target === sheet && Number(number) >= at ? `${prefix ?? ""}${col}${absolute}${Number(number) + 1}` : match;
    });
    cell.value = { formula };
  }));
}

function insertRow(workbook: ExcelJS.Workbook, settings: LayoutSettings, sheet: string, at: number, styleFrom: number) {
  const ws = workbook.getWorksheet(sheet)!;
  const merges = [...(ws.model.merges ?? [])].map((range) => {
    const [start, end] = range.split(":");
    const matchStart = /^([A-Z]+)(\d+)$/.exec(start)!;
    const matchEnd = /^([A-Z]+)(\d+)$/.exec(end ?? start)!;
    return { startCol: matchStart[1], startRow: Number(matchStart[2]), endCol: matchEnd[1], endRow: Number(matchEnd[2]), range };
  });
  for (const merge of merges) ws.unMergeCells(merge.range);
  const source = ws.getRow(styleFrom);
  const styles = Array.from({ length: 23 }, (_, i) => structuredClone(source.getCell(i + 1).style));
  ws.insertRows(at, [new Array(23).fill(null)]);
  for (let i = 0; i < styles.length; i++) ws.getRow(at).getCell(i + 1).style = styles[i];
  for (const merge of merges) {
    if (merge.startRow >= at) { merge.startRow++; merge.endRow++; }
    else if (merge.endRow >= at) merge.endRow++;
    ws.mergeCells(`${merge.startCol}${merge.startRow}:${merge.endCol}${merge.endRow}`);
  }
  shiftSettings(settings, sheet, at);
  shiftFormulas(workbook, sheet, at);
}

function findRow(ws: ExcelJS.Worksheet, text: string) {
  let found = 0;
  ws.eachRow((row) => { if (!found && label(row.getCell("C").value) === text) found = row.number; });
  if (!found) throw new Error(`Template is missing ${text} on ${ws.name}`);
  return found;
}

function findMerchantRow(ws: ExcelJS.Worksheet, text: string) {
  let found = 0;
  ws.eachRow((row) => { if (!found && label(row.getCell("D").value) === text) found = row.number; });
  if (!found) throw new Error(`Template is missing ${text} on ${ws.name}`);
  return found;
}

function addSummaryTerm(ws: ExcelJS.Worksheet, summary: string, source: number, cols: string[]) {
  const row = findRow(ws, summary);
  for (const col of cols) {
    const cell = ws.getCell(`${col}${row}`), value = cell.value;
    if (value && typeof value === "object" && "formula" in value) cell.value = { formula: `${value.formula}+${col}${source}` };
  }
}

function setOutletWiseRow(ws: ExcelJS.Worksheet, at: number, merchantRow: number, outlet: string, name: string) {
  ws.getCell(`C${at}`).value = outlet;
  ws.getCell(`D${at}`).value = name;
  for (const col of ["G", "H", "I", "K", "L"]) ws.getCell(`${col}${at}`).value = { formula: `'Merchant Wise'!${col}${merchantRow}` };
  ws.getCell(`J${at}`).value = { formula: `SUM(H${at}:I${at})` };
  for (const [col, formula] of Object.entries({ M: `IFERROR(J${at}/G${at},0)`, N: `IFERROR(K${at}/G${at}*10,0)`, O: `IFERROR(L${at}/G${at}*20,0)` })) ws.getCell(`${col}${at}`).value = { formula };
  for (const [col, formula] of Object.entries({ P: `G${at}-J${at}`, R: `J${at}`, S: `IFERROR(R${at}/G${at},0)` })) ws.getCell(`${col}${at}`).value = { formula };
}

function setMerchantFormulas(ws: ExcelJS.Worksheet, at: number) {
  for (const [col, formula] of Object.entries({
    G: `E${at}+F${at}`, J: `H${at}+I${at}`,
    M: `IFERROR(H${at}/E${at},0)`, N: `IFERROR(I${at}/F${at},0)`, O: `IFERROR(J${at}/G${at},0)`,
    P: `IFERROR(K${at}/G${at}*10,0)`, Q: `IFERROR(L${at}/G${at}*20,0)`,
    R: `G${at}-J${at}`, T: `J${at}`, U: `IFERROR(T${at}/G${at},0)`,
  })) ws.getCell(`${col}${at}`).value = { formula };
}

export async function prepareSalesReportTemplate(buffer: Buffer, settings: LayoutSettings, originalRows: LayoutRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const excelBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(excelBuffer).set(buffer);
  await workbook.xlsx.load(excelBuffer);
  const mw = workbook.getWorksheet("Merchant Wise")!, ow = workbook.getWorksheet("Outlet Wise")!;
  if (!mw || !ow) throw new Error("Sales Report template requires Merchant Wise and Outlet Wise sheets");
  const retained = new Set(settings.rows.filter((row) => row.row > 0).map((row) => row.row));
  for (const row of originalRows) if (!retained.has(row.row)) {
    for (const col of ["D", "E", "F", "H", "I", "K", "L", "W"]) mw.getCell(`${col}${row.row}`).value = null;
    mw.getRow(row.row).hidden = true;
  }
  const pending = settings.rows.filter((row) => !row.row);
  for (const row of pending) {
    const existing = settings.rows.filter((item) => item.row > 0 && label(item.outlet) === label(row.outlet));
    const online = label(row.outlet) === "online";
    const newOutlet = !online && existing.length === 0;
    const at = newOutlet ? findRow(mw, "showroom total") : online ? (settings.rows.find((item) => label(item.name) === "staff sales")?.row ?? findRow(mw, "showroom total")) : Math.max(...existing.map((item) => item.row)) + 1;
    insertRow(workbook, settings, "Merchant Wise", at, newOutlet ? 20 : Math.max(7, at - 1));
    row.row = at;
    mw.getCell(`D${at}`).value = row.name;
    mw.getCell(`W${at}`).value = row.key;
    setMerchantFormulas(mw, at);
    if (newOutlet) {
      const outletNumber = Math.max(0, ...originalRows.map((item) => Number(mw.getCell(`B${item.row}`).value) || 0)) + 1;
      mw.getCell(`B${at}`).value = outletNumber;
      mw.getCell(`C${at}`).value = row.outlet;
      insertRow(workbook, settings, "Merchant Wise", at + 1, 10);
      const totalRow = at + 1;
      mw.getCell(`D${totalRow}`).value = "Total";
      for (const col of ["E", "F", "H", "I", "K", "L"]) mw.getCell(`${col}${totalRow}`).value = { formula: `SUM(${col}${at}:${col}${at})` };
      mw.getCell(`G${totalRow}`).value = { formula: `E${totalRow}+F${totalRow}` };
      mw.getCell(`J${totalRow}`).value = { formula: `H${totalRow}+I${totalRow}` };
      mw.mergeCells(`C${at}:C${totalRow}`);
      const outletRow = findRow(ow, "showroom total");
      insertRow(workbook, settings, "Outlet Wise", outletRow, 7);
      ow.getCell(`B${outletRow}`).value = outletNumber;
      setOutletWiseRow(ow, outletRow, totalRow, row.outlet, "Total");
      addSummaryTerm(mw, "showroom total", totalRow, ["E", "F", "G", "H", "I", "J", "K", "L"]);
      addSummaryTerm(mw, "grand total", totalRow, ["E", "F", "G", "H", "I", "J", "K", "L"]);
      addSummaryTerm(ow, "showroom total", outletRow, ["G", "H", "I", "J", "K", "L"]);
      addSummaryTerm(ow, "grand total", outletRow, ["G", "H", "I", "J", "K", "L"]);
    } else if (online) {
      const outletRow = findMerchantRow(ow, "staff sales") + 1;
      insertRow(workbook, settings, "Outlet Wise", outletRow, 14);
      setOutletWiseRow(ow, outletRow, at, "Online", row.name);
      for (const summary of ["merchant total", "grand total"]) {
        addSummaryTerm(mw, summary, at, ["E", "F", "G", "H", "I", "J", "K", "L"]);
        addSummaryTerm(ow, summary, outletRow, ["G", "H", "I", "J", "K", "L"]);
      }
    } else {
      const nextOutlet = Math.min(Infinity, ...settings.rows.filter((item) => item.row > at && label(item.outlet) !== label(row.outlet)).map((item) => item.row));
      let total = at + 1;
      while (total < nextOutlet && label(mw.getCell(`D${total}`).value) !== "total") total++;
      if (total < nextOutlet && label(mw.getCell(`D${total}`).value) === "total") {
        const first = Math.min(...settings.rows.filter((item) => label(item.outlet) === label(row.outlet) && item.row > 0).map((item) => item.row));
        for (const col of ["E", "F", "H", "I", "K", "L"]) mw.getCell(`${col}${total}`).value = { formula: `SUM(${col}${first}:${col}${at})` };
      }
    }
  }
  for (const row of settings.rows.filter((item) => item.row > 0)) {
    mw.getCell(`D${row.row}`).value = row.name;
    mw.getCell(`W${row.row}`).value = row.key;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
