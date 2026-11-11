import { NextRequest, NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { loadSalesReportConfig, saveSalesReportConfig, validateSalesReportConfig } from "@/lib/sales-report/config";
import { mergeSalesReportSettings, salesReportSettingsForClient } from "@/lib/sales-report/run";

export const dynamic = "force-dynamic";

async function authorizedCompany(permission: "finance.sales_report.read" | "finance.sales_report.manage") {
  if (isVaultOsDeployment()) return { error: NextResponse.json({ error: "Sales Report is unavailable" }, { status: 404 }) };
  const auth = await requirePermission(permission);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const companyId = auth.context?.user?.companyId;
  return companyId ? { companyId, canEdit: hasPermission(auth.context, "finance.sales_report.manage") } : { error: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }) };
}

function text(value: ExcelJS.CellValue) { return String(value ?? "").trim(); }

function targetValue(cell: ExcelJS.Cell, label: string) {
  if (cell.value === null || cell.value === undefined || cell.text.trim() === "") return { value: null as number | null };
  const value = typeof cell.value === "number" ? cell.value : Number(cell.text.replace(/,/g, "").trim());
  return Number.isFinite(value) && value >= 0 ? { value } : { error: `${label} must be a nonnegative number` };
}

function targetTemplate(rows: Array<Record<string, unknown>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Targets & VAT");
  sheet.columns = [{ header: "Outlet", key: "outlet", width: 24 }, { header: "Merchant", key: "merchant", width: 30 }, { header: "Showroom Target", key: "showroom", width: 20 }, { header: "Online Target", key: "online", width: 20 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  for (const row of rows) sheet.addRow({ outlet: String(row.outlet ?? ""), merchant: String(row.name ?? ""), showroom: row.showroomTarget == null ? null : Number(row.showroomTarget), online: row.onlineTarget == null ? null : Number(row.onlineTarget) });
  sheet.getColumn("showroom").numFmt = "#,##0.00";
  sheet.getColumn("online").numFmt = "#,##0.00";
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return workbook;
}

export async function GET(request: NextRequest) {
  const auth = await authorizedCompany("finance.sales_report.read");
  if (auth.error) return auth.error;
  const settings = mergeSalesReportSettings(await loadSalesReportConfig(auth.companyId!));
  if (request.nextUrl.searchParams.get("download") === "targets") {
    if (!auth.canEdit) return NextResponse.json({ error: "You do not have permission to manage Sales Report settings" }, { status: 403 });
    const workbook = targetTemplate(settings.rows as Array<Record<string, unknown>>);
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="sales-report-targets.xlsx"', "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ settings: salesReportSettingsForClient(settings), canEdit: auth.canEdit });
}

export async function PUT(request: NextRequest) {
  const auth = await authorizedCompany("finance.sales_report.manage");
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.rows) || !body.maps || typeof body.maps !== "object") {
    return NextResponse.json({ error: "Invalid report settings" }, { status: 400 });
  }
  const invalid = validateSalesReportConfig(body as Record<string, unknown>);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const settings = mergeSalesReportSettings(body);
  await saveSalesReportConfig(auth.companyId!, settings);
  return NextResponse.json({ settings: salesReportSettingsForClient(settings) });
}

export async function POST(request: NextRequest) {
  const auth = await authorizedCompany("finance.sales_report.manage");
  if (auth.error) return auth.error;
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Choose an .xlsx targets template" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "The targets template must be 5MB or smaller" }, { status: 400 });
  try {
    const workbook = new ExcelJS.Workbook();
    const source = await file.arrayBuffer();
    const excelBuffer = new ArrayBuffer(source.byteLength);
    new Uint8Array(excelBuffer).set(new Uint8Array(source));
    await workbook.xlsx.load(excelBuffer);
    const sheet = workbook.getWorksheet("Targets & VAT") ?? workbook.worksheets[0];
    if (!sheet) throw new Error("The workbook has no worksheet");
    const headings = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => headings.set(cell.text.trim().toLowerCase(), column));
    const outletColumn = headings.get("outlet"), merchantColumn = headings.get("merchant"), showroomColumn = headings.get("showroom target"), onlineColumn = headings.get("online target");
    if (!outletColumn || !merchantColumn || !showroomColumn || !onlineColumn) throw new Error("Use the downloaded template with Outlet, Merchant, Showroom Target, and Online Target columns");
    const settings = mergeSalesReportSettings(await loadSalesReportConfig(auth.companyId!));
    const rows = settings.rows as Array<Record<string, unknown>>;
    const configured = new Map(rows.map((row, index) => [`${String(row.outlet ?? "").trim().toLowerCase()}|${String(row.name ?? "").trim().toLowerCase()}`, index]));
    const changes = new Map<number, { showroomTarget: number | null; onlineTarget: number | null }>();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const outlet = text(row.getCell(outletColumn).value), merchant = text(row.getCell(merchantColumn).value);
      if (!outlet && !merchant && !row.getCell(showroomColumn).text.trim() && !row.getCell(onlineColumn).text.trim()) continue;
      if (!outlet || !merchant) throw new Error(`Row ${rowNumber} needs both Outlet and Merchant`);
      const index = configured.get(`${outlet.toLowerCase()}|${merchant.toLowerCase()}`);
      if (index === undefined) throw new Error(`Row ${rowNumber}: ${outlet} / ${merchant} is not in the Sales Report template`);
      if (changes.has(index)) throw new Error(`Row ${rowNumber}: ${outlet} / ${merchant} appears more than once`);
      const showroom = targetValue(row.getCell(showroomColumn), `Row ${rowNumber} Showroom Target`);
      const online = targetValue(row.getCell(onlineColumn), `Row ${rowNumber} Online Target`);
      if ("error" in showroom) throw new Error(showroom.error);
      if ("error" in online) throw new Error(online.error);
      changes.set(index, { showroomTarget: showroom.value, onlineTarget: online.value });
    }
    if (!changes.size) throw new Error("No target rows were found in the template");
    const next = { ...settings, rows: rows.map((row, index) => changes.has(index) ? { ...row, ...changes.get(index) } : row) };
    const invalid = validateSalesReportConfig(next);
    if (invalid) throw new Error(invalid);
    await saveSalesReportConfig(auth.companyId!, next);
    return NextResponse.json({ settings: salesReportSettingsForClient(next), updated: changes.size });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import targets template" }, { status: 400 }); }
}
