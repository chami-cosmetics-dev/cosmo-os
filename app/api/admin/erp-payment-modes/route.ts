import { NextResponse } from "next/server";

import { listCompanyErpPaymentModes } from "@/lib/erp-payment-modes";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("fulfillment.delivery_invoice.mark_complete");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const modes = await listCompanyErpPaymentModes(companyId);
  return NextResponse.json({ modes });
}
