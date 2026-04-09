import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

/**
 * Lightweight: locations + merchants for the manual order page.
 * Per-location products and shipping load via GET /api/admin/orders/manual/location-items.
 */
export async function GET(_request: NextRequest) {
  const auth = await requirePermission("orders.create_manual");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const [locations, merchants] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        manualInvoicePrefix: true,
        manualInvoiceSeqPadding: true,
        defaultMerchantUserId: true,
      },
    }),
    prisma.user.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return NextResponse.json({
    locations,
    merchants,
  });
}
