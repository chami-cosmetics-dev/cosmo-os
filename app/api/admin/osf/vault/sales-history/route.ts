import { NextRequest, NextResponse } from "next/server";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { getAllOsfErpInstances, OsfErpError } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { requirePermission } from "@/lib/rbac";
import { attachOsPriority, fetchVaultCatalog } from "@/lib/vault-osf/catalog";
import { isVaultOsfConfigured, resolveVaultBusinessUnits } from "@/lib/vault-osf/columns";
import {
  buildSalesHistoryTemplateAoa,
  importSalesHistory,
  workbookFromAoa,
} from "@/lib/vault-osf/sales-history-import";
import { vaultOsfSalesHistoryQuerySchema } from "@/lib/validation/osf";

export const maxDuration = 120;

function vaultUnitsOrConflict(companyId: string) {
  return resolveOsfColumns(companyId).then((columns) => {
    if (!isVaultOsfConfigured(columns)) {
      return { error: true as const };
    }
    const units = resolveVaultBusinessUnits(columns).map((u) => ({
      key: u.key,
      label: u.label,
    }));
    if (units.length === 0) return { error: true as const };
    return { error: false as const, units };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = vaultOsfSalesHistoryQuerySchema.safeParse({
    month: request.nextUrl.searchParams.get("month") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ready = await vaultUnitsOrConflict(companyId);
  if (ready.error) {
    return NextResponse.json(
      { error: "Vault OSF is not configured", code: "VAULT_OSF_NOT_CONFIGURED" },
      { status: 409 },
    );
  }

  try {
    const instances = await getAllOsfErpInstances(companyId);
    const slots = resolveErpSlots(instances);
    const erp1 = slots.erp1
      ? instances.find((i) => i.id === slots.erp1!.id)
      : instances[0];
    if (!erp1) {
      return NextResponse.json(
        { error: "ERP1 missing", code: "ERP_UNAVAILABLE" },
        { status: 502 },
      );
    }
    const catalog = await attachOsPriority(companyId, await fetchVaultCatalog(erp1.cfg));
    const history = await prisma.osfMonthlySalesHistory.findMany({
      where: { companyId, month: parsed.data.month },
    });
    const qtyBySku = new Map<string, Record<string, number | null>>();
    for (const h of history) {
      const rec = qtyBySku.get(h.sku) ?? {};
      rec[h.columnKey] = h.qty;
      qtyBySku.set(h.sku, rec);
    }
    const aoa = buildSalesHistoryTemplateAoa({
      columns: ready.units,
      rows: catalog.map((r) => ({
        sku: r.sku,
        barcode: r.barcode,
        qty: qtyBySku.get(r.sku) ?? {},
      })),
    });
    const buffer = workbookFromAoa(aoa, "Sales");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="OSF-sales-history-${parsed.data.month}.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof OsfErpError) {
      return NextResponse.json(
        { error: "ERP unreachable", code: "ERP_UNAVAILABLE", detail: err.message },
        { status: 502 },
      );
    }
    console.error("[vault OSF sales-history GET]", err);
    return NextResponse.json({ error: "Failed to build template" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const ready = await vaultUnitsOrConflict(companyId);
  if (ready.error) {
    return NextResponse.json(
      { error: "Vault OSF is not configured", code: "VAULT_OSF_NOT_CONFIGURED" },
      { status: 409 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const monthRaw = String(form.get("month") ?? "");
  const parsed = vaultOsfSalesHistoryQuerySchema.safeParse({ month: monthRaw });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const productSkus = await prisma.productItem.findMany({
    where: { companyId, sku: { not: null } },
    select: { sku: true },
    distinct: ["sku"],
  });
  const known = new Set(productSkus.map((p) => p.sku!).filter(Boolean));

  try {
    const instances = await getAllOsfErpInstances(companyId);
    const slots = resolveErpSlots(instances);
    const erp1 = slots.erp1
      ? instances.find((i) => i.id === slots.erp1!.id)
      : instances[0];
    if (erp1) {
      const catalog = await fetchVaultCatalog(erp1.cfg);
      for (const row of catalog) known.add(row.sku);
    }
  } catch {
    // OS ProductItem SKUs still accepted if ERP1 is down
  }

  try {
    const result = await importSalesHistory({
      companyId,
      month: parsed.data.month,
      buffer,
      filename: file.name || "upload.xlsx",
      columns: ready.units,
      knownSkus: known,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
