import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { buildCatalogRows } from "@/lib/osf/catalog-rows";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { buildRopTemplateAoa } from "@/lib/osf/rop-import";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

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

  const [catalog, columns, ropRows] = await Promise.all([
    buildCatalogRows(companyId, {}),
    resolveOsfColumns(companyId),
    prisma.productOsfRop.findMany({
      where: { companyId },
      select: { sku: true, columnKey: true, ropQty: true },
    }),
  ]);

  const ropColumns = columns
    .filter((c) => c.active && c.includeInRop)
    .map((c) => ({ key: c.key, label: c.label }));

  const ropsBySku = new Map<string, Record<string, number | null>>();
  for (const r of ropRows) {
    const map = ropsBySku.get(r.sku) ?? {};
    map[r.columnKey] = r.ropQty;
    ropsBySku.set(r.sku, map);
  }

  const aoa = buildRopTemplateAoa({
    ropColumns,
    rows: catalog.map((c) => ({
      sku: c.sku,
      barcode: c.barcode,
      rops: ropsBySku.get(c.sku) ?? {},
    })),
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
