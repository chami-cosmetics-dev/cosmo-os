import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { buildCatalogRows } from "@/lib/osf/catalog-rows";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { buildRopTemplateAoa } from "@/lib/osf/rop-import";
import { selectVatRopColumns } from "@/lib/osf/vat-rop-columns";
import { prisma } from "@/lib/prisma";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { attachOsPriority, fetchVaultCatalog } from "@/lib/vault-osf/catalog";
import { ensureVaultForceIncludedRops } from "@/lib/vault-osf/ensure-force-included-rops";

export async function GET() {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const columns = await resolveOsfColumns(companyId);
  const ropColumns = columns
    .filter((c) => c.active && c.includeInRop)
    .map((c) => ({ key: c.key, label: c.label }));

  let templateRows: Array<{ sku: string; barcode: string | null; rops: Record<string, number | null> }>;

  if (isVaultOsDeployment()) {
    await ensureVaultForceIncludedRops(companyId);
    const erpInstances = await getAllOsfErpInstances(companyId);
    const slots = resolveErpSlots(erpInstances);
    const erp1 = slots.erp1
      ? erpInstances.find((i) => i.id === slots.erp1!.id)
      : erpInstances[0];
    if (!erp1) {
      return NextResponse.json(
        { error: "ERP1 unreachable", code: "ERP_UNAVAILABLE" },
        { status: 502 },
      );
    }
    const [catalog, ropRows] = await Promise.all([
      attachOsPriority(companyId, await fetchVaultCatalog(erp1.cfg)),
      prisma.productOsfRop.findMany({
        where: { companyId },
        select: { sku: true, columnKey: true, ropQty: true },
      }),
    ]);
    const ropsBySku = new Map<string, Record<string, number | null>>();
    for (const r of ropRows) {
      const map = ropsBySku.get(r.sku) ?? {};
      map[r.columnKey] = r.ropQty;
      ropsBySku.set(r.sku, map);
    }
    templateRows = catalog.map((c) => ({
      sku: c.sku,
      barcode: c.barcode,
      rops: ropsBySku.get(c.sku) ?? {},
    }));
  } else {
    const [catalog, ropRows] = await Promise.all([
      buildCatalogRows(companyId, {}),
      prisma.productOsfRop.findMany({
        where: { companyId },
        select: { sku: true, columnKey: true, ropQty: true },
      }),
    ]);
    const ropsBySku = new Map<string, Record<string, number | null>>();
    for (const r of ropRows) {
      const map = ropsBySku.get(r.sku) ?? {};
      map[r.columnKey] = r.ropQty;
      ropsBySku.set(r.sku, map);
    }
    templateRows = catalog.map((c) => ({
      sku: c.sku,
      barcode: c.barcode,
      rops: ropsBySku.get(c.sku) ?? {},
    }));
  }

  const erp1TotalKeys = isVaultOsDeployment()
    ? undefined
    : selectVatRopColumns(columns).map((c) => c.key);

  const aoa = buildRopTemplateAoa({
    ropColumns,
    rows: templateRows,
    erp1TotalKeys,
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "ROP");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const stamp = formatAppIsoDate(new Date());
  const filename = `OSF-ROP-template-${stamp}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
