import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  field: z.enum(["handoverAt", "valuedAt", "receivedAt"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = await requirePermission("purchasing.grn.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  await prisma.grnPurchaseReceipt.update({
    where: { companyId_name: { companyId, name: decodedName } },
    data: { [parsed.data.field]: new Date() },
  });

  return NextResponse.json({ ok: true });
}
