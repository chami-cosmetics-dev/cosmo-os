import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  field: z.enum(["handoverAt", "valuedAt", "receivedAt"]),
});

const FIELD_PERMISSIONS: Record<z.infer<typeof schema>["field"], string> = {
  handoverAt: "purchasing.grn.mark_handover",
  valuedAt: "purchasing.grn.mark_valued",
  receivedAt: "purchasing.grn.mark_received",
};

const FIELD_ACTOR_COLUMNS: Record<z.infer<typeof schema>["field"], string> = {
  handoverAt: "handoverById",
  valuedAt: "valuedById",
  receivedAt: "receivedById",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const auth = await requirePermission(FIELD_PERMISSIONS[parsed.data.field]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const user = context?.user;
  const companyId = user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const row = await prisma.grnPurchaseReceipt.findUnique({
    where: { companyId_name: { companyId, name: decodedName } },
    select: { docstatus: true, handoverAt: true, valuedAt: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Purchase receipt not found" }, { status: 404 });
  }
  if (row.docstatus === 2) {
    return NextResponse.json({ error: "Cancelled purchase receipts cannot be marked" }, { status: 409 });
  }
  if (parsed.data.field === "valuedAt" && !row.handoverAt) {
    return NextResponse.json({ error: "Mark handover before marking valued" }, { status: 409 });
  }
  if (parsed.data.field === "receivedAt" && (!row.handoverAt || !row.valuedAt)) {
    return NextResponse.json({ error: "Mark handover and valued before marking GRN received" }, { status: 409 });
  }

  await prisma.grnPurchaseReceipt.update({
    where: { companyId_name: { companyId, name: decodedName } },
    data: {
      [parsed.data.field]: new Date(),
      [FIELD_ACTOR_COLUMNS[parsed.data.field]]: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}




