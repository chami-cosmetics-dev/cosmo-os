import { NextRequest, NextResponse } from "next/server";

import { getMerchantDisplayName } from "@/lib/customer-insight/auto-allocate";
import { markContactInsightContacted } from "@/lib/customer-insight/contacted";
import { isAllocatedOwner } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  customerInsightContactedBodySchema,
  customerInsightContactParamsSchema,
} from "@/lib/validation/customer-insight";

type Params = { params: Promise<{ contactId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const user = auth.context!.user;
  if (!companyId || !user) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { contactId } = await params;
  const idParsed = customerInsightContactParamsSchema.safeParse({ contactId });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: idParsed.error.flatten() },
      { status: 400 }
    );
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: idParsed.data.contactId, companyId },
    select: { id: true, assignedMerchant: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const viewer = {
    knownName: user.knownName ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    roleNames: (auth.context!.roleNames as string[]) ?? [],
    permissionKeys: (auth.context!.permissionKeys as string[]) ?? [],
    couponCodes: (await prisma.user.findUnique({
      where: { id: user.id },
      select: { couponCodes: true },
    }))?.couponCodes,
  };
  if (!isAllocatedOwner(viewer, contact.assignedMerchant)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = customerInsightContactedBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await markContactInsightContacted({
    companyId,
    contactId: contact.id,
    actorUserId: user.id,
    merchantName: getMerchantDisplayName(user) ?? contact.assignedMerchant,
    category: parsed.data.category,
    note: parsed.data.note,
    remark: parsed.data.remark,
    outcome: parsed.data.outcome,
  });
  if (!result) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
