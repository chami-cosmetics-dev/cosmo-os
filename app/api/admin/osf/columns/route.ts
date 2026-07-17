import { NextRequest, NextResponse } from "next/server";

import { listOsfColumnsForApi } from "@/lib/osf/column-config";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { osfColumnUpsertSchema } from "@/lib/validation/osf";

export async function GET() {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const columns = await listOsfColumnsForApi(companyId);
  return NextResponse.json({ columns });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = osfColumnUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const keys = parsed.data.columns.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json({ error: "Duplicate column keys" }, { status: 400 });
  }

  const locationIds = [
    ...new Set(
      parsed.data.columns
        .map((c) => c.companyLocationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (locationIds.length) {
    const locs = await prisma.companyLocation.findMany({
      where: { companyId, id: { in: locationIds } },
      select: { id: true },
    });
    if (locs.length !== locationIds.length) {
      return NextResponse.json({ error: "Invalid companyLocationId" }, { status: 400 });
    }
  }

  const instanceIds = [
    ...new Set(
      parsed.data.columns
        .map((c) => c.erpnextInstanceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (instanceIds.length) {
    const found = await prisma.erpnextInstance.findMany({
      where: { companyId, id: { in: instanceIds } },
      select: { id: true },
    });
    if (found.length !== instanceIds.length) {
      return NextResponse.json({ error: "Invalid erpnextInstanceId" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const col of parsed.data.columns) {
      await tx.osfColumnConfig.upsert({
        where: { companyId_key: { companyId, key: col.key } },
        create: {
          companyId,
          key: col.key,
          label: col.label,
          companyLocationId: col.companyLocationId ?? null,
          erpnextInstanceId: col.erpnextInstanceId ?? null,
          directWarehouses: col.directWarehouses ?? [],
          includeInStock: col.includeInStock,
          includeInRop: col.includeInRop,
          sortOrder: col.sortOrder,
          active: col.active,
        },
        update: {
          label: col.label,
          companyLocationId: col.companyLocationId ?? null,
          erpnextInstanceId: col.erpnextInstanceId ?? null,
          directWarehouses: col.directWarehouses ?? [],
          includeInStock: col.includeInStock,
          includeInRop: col.includeInRop,
          sortOrder: col.sortOrder,
          active: col.active,
        },
      });
    }
  });

  const columns = await listOsfColumnsForApi(companyId);
  return NextResponse.json({ columns });
}
