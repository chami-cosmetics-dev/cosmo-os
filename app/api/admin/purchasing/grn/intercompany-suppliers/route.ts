import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  supplier: z.string().trim().min(1),
  supplierName: z.string().trim().optional().nullable(),
});

export async function GET() {
  const auth = await requirePermission("purchasing.grn.match_ssr");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const suppliers = await prisma.grnIntercompanySupplier.findMany({
    orderBy: [{ supplier: "asc" }],
  });

  return NextResponse.json({
    suppliers: suppliers.map((row) => ({
      id: row.id,
      supplier: row.supplier,
      supplierName: row.supplierName,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.match_ssr");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supplier = parsed.data.supplier.trim();
  const supplierName = parsed.data.supplierName?.trim() || null;
  const row = await prisma.grnIntercompanySupplier.upsert({
    where: { supplier },
    create: { supplier, supplierName },
    update: { supplierName },
  });

  return NextResponse.json({
    supplier: {
      id: row.id,
      supplier: row.supplier,
      supplierName: row.supplierName,
    },
  });
}
