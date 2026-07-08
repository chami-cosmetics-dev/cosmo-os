import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const markContactedSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(["contacts.updates.manage", "contacts.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = markContactedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: idParsed.data, companyId },
    select: { id: true, name: true, phoneNumber: true, email: true, lastPurchaseAt: true, recentMerchant: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user?.id,
    module: "contacts",
    action: "contact_follow_up_contacted",
    entityType: "ContactMaster",
    entityId: contact.id,
    summary: `Marked ${contact.name} as contacted`,
    metadata: {
      note: parsed.data.note?.trim() || null,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      lastPurchaseAt: contact.lastPurchaseAt,
      recentMerchant: contact.recentMerchant,
    },
  });

  return NextResponse.json({ ok: true, contactedAt: new Date().toISOString() });
}
