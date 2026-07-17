import { NextRequest, NextResponse } from "next/server";

import { listOsfBuyers } from "@/lib/osf/buyer-config";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { osfBuyerUpsertSchema } from "@/lib/validation/osf";

export async function GET() {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const buyers = await listOsfBuyers(companyId);
  return NextResponse.json({ buyers });
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
  const parsed = osfBuyerUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const names = parsed.data.buyers.map((b) => b.name);
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return NextResponse.json({ error: "Duplicate buyer names" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    // Remove buyers no longer present in the payload.
    await tx.osfBuyer.deleteMany({
      where: { companyId, name: { notIn: names.length ? names : ["\u0000"] } },
    });
    for (const buyer of parsed.data.buyers) {
      await tx.osfBuyer.upsert({
        where: { companyId_name: { companyId, name: buyer.name } },
        create: {
          companyId,
          name: buyer.name,
          brands: buyer.brands ?? [],
          sortOrder: buyer.sortOrder,
          active: buyer.active,
        },
        update: {
          brands: buyer.brands ?? [],
          sortOrder: buyer.sortOrder,
          active: buyer.active,
        },
      });
    }
  });

  const buyers = await listOsfBuyers(companyId);
  return NextResponse.json({ buyers });
}
