import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

async function resolveInstance(id: string, companyId: string) {
  const instance = await prisma.erpnextInstance.findUnique({ where: { id } });
  if (!instance || instance.companyId !== companyId) return null;
  return instance;
}

function hasErpConnectionCredentials(instance: {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}) {
  return (
    instance.baseUrl.trim().length > 0 &&
    instance.apiKey.trim().length > 0 &&
    instance.apiSecret.trim().length > 0
  );
}

// POST /api/admin/company/erp-instances/[id]/enable-shopify-sync
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 404 });

  const { id } = await params;
  if (!cuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await resolveInstance(id, companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!hasErpConnectionCredentials(existing)) {
    return NextResponse.json(
      { error: "Complete ERP connection credentials before enabling Shopify sync." },
      { status: 400 }
    );
  }

  const linkedLocationCount = await prisma.companyLocation.count({
    where: {
      companyId,
      erpnextInstanceId: id,
      erpnextCompany: { not: null },
      erpnextWarehouse: { not: null },
    },
  });
  if (linkedLocationCount === 0) {
    return NextResponse.json(
      {
        error:
          "Assign this ERP instance to at least one location with ERP company and warehouse before enabling sync.",
      },
      { status: 400 }
    );
  }

  if (existing.shopifySyncEnabledAt) {
    return NextResponse.json({
      ok: true,
      alreadyEnabled: true,
      shopifySyncEnabledAt: existing.shopifySyncEnabledAt.toISOString(),
    });
  }

  const enabledAt = new Date();
  const updated = await prisma.erpnextInstance.update({
    where: { id },
    data: { shopifySyncEnabledAt: enabledAt },
    select: { id: true, label: true, shopifySyncEnabledAt: true },
  });

  return NextResponse.json({
    ok: true,
    alreadyEnabled: false,
    shopifySyncEnabledAt: updated.shopifySyncEnabledAt!.toISOString(),
  });
}
