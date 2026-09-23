import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  supplier: z.string().trim().min(1),
  supplierName: z.string().trim().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("purchasing.grn.match_ssr");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { id } = await params;
  const supplier = parsed.data.supplier.trim();
  const supplierName = parsed.data.supplierName?.trim() || null;

  try {
    const row = await prisma.grnIntercompanySupplier.update({
      where: { id },
      data: { supplier, supplierName },
    });
    return NextResponse.json({
      supplier: {
        id: row.id,
        supplier: row.supplier,
        supplierName: row.supplierName,
      },
    });
  } catch {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("purchasing.grn.match_ssr");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  await prisma.grnIntercompanySupplier.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
