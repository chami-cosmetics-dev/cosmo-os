import { NextRequest, NextResponse } from "next/server";

import { listContactEventHistory } from "@/lib/customer-insight/contacted";
import {
  isAllocatedOwner,
  hasInsightAdminView,
} from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
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

  const { contactId: rawId } = await params;
  const idParsed = cuidSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: idParsed.data, companyId },
    select: { id: true, assignedMerchant: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { couponCodes: true },
  });
  const viewer = {
    knownName: user.knownName ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    roleNames,
    couponCodes: dbUser?.couponCodes ?? null,
    permissionKeys,
  };

  const canSeeHistory =
    hasInsightAdminView({ roleNames, permissionKeys }) ||
    permissionKeys.includes("contacts.updates.read") ||
    permissionKeys.includes("contacts.updates.manage") ||
    permissionKeys.includes("contacts.master.read") ||
    permissionKeys.includes("contacts.master.manage") ||
    permissionKeys.includes("contacts.manage") ||
    isAllocatedOwner(viewer, contact.assignedMerchant);

  if (!canSeeHistory) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await listContactEventHistory({
    companyId,
    contactId: contact.id,
  });
  return NextResponse.json({ items });
}
