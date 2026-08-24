import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { normalizeNmrItemCode } from "@/lib/nmr-approved-items";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const createSchema = z.object({
  itemCode: trimmedString(1, LIMITS.sku.max),
});

export async function GET() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const items = await prisma.nmrApprovedItemCode.findMany({
    where: { companyId },
    orderBy: { itemCode: "asc" },
    select: { id: true, itemCode: true, createdAt: true },
  });

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid item code", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const itemCode = normalizeNmrItemCode(parsed.data.itemCode);
  const existing = await prisma.nmrApprovedItemCode.findUnique({
    where: { companyId_itemCode: { companyId, itemCode } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Item is already NMR approved" }, { status: 409 });
  }

  const item = await prisma.nmrApprovedItemCode.create({
    data: { companyId, itemCode },
    select: { id: true, itemCode: true, createdAt: true },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "products",
    action: "setting_created",
    entityType: "NmrApprovedItemCode",
    entityId: item.id,
    summary: `Added NMR-approved item ${item.itemCode}`,
    afterData: { itemCode: item.itemCode },
  });

  return NextResponse.json(item, { status: 201 });
}
