import { NextRequest, NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { saveVaultSettings, validateVaultSettings, vaultReport, vaultSettings, vaultWorkbook } from "@/lib/vault-sales-report";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(manage = false) {
  if (!isVaultOsDeployment()) return { error: NextResponse.json({ error: "Unavailable" }, { status: 404 }) };
  const auth = await requirePermission(manage ? "finance.sales_report.manage" : "finance.sales_report.read");
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const companyId = auth.context?.user?.companyId;
  if (!companyId) return { error: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }) };
  return { companyId, canEdit: hasPermission(auth.context, "finance.sales_report.manage") };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(); if (auth.error) return auth.error;
  const settings = await vaultSettings(auth.companyId!);
  if (request.nextUrl.searchParams.get("download") === "targets") {
    if (!auth.canEdit) return NextResponse.json({ error: "You cannot manage targets" }, { status: 403 });
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Targets");
    ws.addRow(["Merchant", "Target"]);
    for (const merchant of settings.merchants) ws.addRow([merchant, settings.targets.find(x => x.merchant.toLowerCase() === merchant.toLowerCase())?.target ?? null]);
    ws.getColumn(1).width = 32; ws.getColumn(2).width = 20; ws.getColumn(2).numFmt = "#,##0.00";
    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="vault-sales-report-targets.xlsx"' } });
  }
  return NextResponse.json({ settings, canEdit: auth.canEdit });
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(true); if (auth.error) return auth.error;
  const settings: unknown = await request.json().catch(() => null);
  if (!validateVaultSettings(settings)) return NextResponse.json({ error: "Invalid merchant or mapping settings" }, { status: 400 });
  await saveVaultSettings(auth.companyId!, settings);
  return NextResponse.json({ settings });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const auth = await authorize(true); if (auth.error) return auth.error;
    try {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || file.size > 5 * 1024 * 1024) throw new Error("Choose a targets .xlsx file under 5 MB");
      const wb = new ExcelJS.Workbook(); const bytes = await file.arrayBuffer();
      const input = new ArrayBuffer(bytes.byteLength); new Uint8Array(input).set(new Uint8Array(bytes));
      await wb.xlsx.load(input);
      const ws = wb.getWorksheet("Targets") || wb.worksheets[0];
      if (!ws || ws.getCell("A1").text.trim().toLowerCase() !== "merchant" || ws.getCell("B1").text.trim().toLowerCase() !== "target") throw new Error("Use the downloaded Merchant and Target template");
      const settings = await vaultSettings(auth.companyId!); const targets = [...settings.targets];
      for (let number = 2; number <= ws.rowCount; number++) {
        const merchant = ws.getCell(`A${number}`).text.trim(), raw = ws.getCell(`B${number}`).text.trim();
        if (!merchant && !raw) continue;
        if (!settings.merchants.some(x => x.toLowerCase() === merchant.toLowerCase())) throw new Error(`Row ${number}: merchant is not in the template layout`);
        const value = raw ? Number(raw.replace(/,/g, "")) : null;
        if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`Row ${number}: invalid target`);
        const index = targets.findIndex(x => x.merchant.toLowerCase() === merchant.toLowerCase());
        if (index >= 0) targets.splice(index, 1);
        if (value !== null) targets.push({ merchant, target: value });
      }
      const next = { ...settings, targets };
      await saveVaultSettings(auth.companyId!, next);
      return NextResponse.json({ settings: next });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import targets" }, { status: 400 }); }
  }
  const auth = await authorize(); if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const from = body?.from, to = body?.to;
  if (typeof from !== "string" || typeof to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return NextResponse.json({ error: "Choose a valid date range" }, { status: 400 });
  const promotion = body?.promotion;
  if (promotion && (!Array.isArray(promotion.codes) || !promotion.codes.length || promotion.codes.some((x: unknown) => typeof x !== "string") || !["exact", "starts", "contains"].includes(promotion.mode))) return NextResponse.json({ error: "Enter valid promotion coupon codes" }, { status: 400 });
  const report = await vaultReport(auth.companyId!, from, to, promotion ? { codes: promotion.codes.map((x: string) => x.trim().toLowerCase()).filter(Boolean), mode: promotion.mode } : undefined);
  if (body.export) {
    const buffer = await vaultWorkbook(report);
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Vault Sales Report ${from} to ${to}.xlsx"` } });
  }
  return NextResponse.json(report);
}
