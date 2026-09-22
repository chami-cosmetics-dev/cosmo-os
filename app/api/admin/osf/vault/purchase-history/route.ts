import { NextRequest, NextResponse } from "next/server";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { importVaultPurchaseHistory } from "@/lib/vault-osf/purchase-history-import";

export const maxDuration = 300;

export async function GET() {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isVaultOsDeployment()) {
    return NextResponse.json(
      { error: "Vault OSF is not available on Cosmo OS", code: "VAULT_OSF_NOT_ON_COSMO" },
      { status: 409 },
    );
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const [count, oldest, newest] = await Promise.all([
    prisma.osfPurchaseHistoryLine.count({ where: { companyId } }),
    prisma.osfPurchaseHistoryLine.findFirst({
      where: { companyId },
      orderBy: { postingDate: "asc" },
      select: { postingDate: true },
    }),
    prisma.osfPurchaseHistoryLine.findFirst({
      where: { companyId },
      orderBy: { postingDate: "desc" },
      select: { postingDate: true },
    }),
  ]);

  return NextResponse.json({
    lineCount: count,
    oldestDate: oldest?.postingDate ?? null,
    newestDate: newest?.postingDate ?? null,
    osfMonths: ["2026-04", "2026-05"],
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isVaultOsDeployment()) {
    return NextResponse.json(
      { error: "Vault OSF is not available on Cosmo OS", code: "VAULT_OSF_NOT_ON_COSMO" },
      { status: 409 },
    );
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const name = file.name || "purchase-history.xlsx";
  if (!/\.xlsx$/i.test(name)) {
    return NextResponse.json({ error: "Upload an .xlsx file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await importVaultPurchaseHistory({
      companyId,
      buffer,
      filename: name,
    });
    return NextResponse.json({
      inserted: result.inserted,
      skippedBlank: result.skippedBlank,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 50),
      monthsPresent: result.monthsPresent,
      osfMonths: result.osfMonths,
    });
  } catch (err) {
    console.error("[vault purchase-history import]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
