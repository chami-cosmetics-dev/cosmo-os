import { NextRequest, NextResponse } from "next/server";

import { listContactEventHistory } from "@/lib/customer-insight/contacted";
import { viewerIdentityForMerchantFilter } from "@/lib/customer-insight/merchant-label-aliases";
import {
  isAllocatedOwner,
  hasInsightAdminView,
} from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";
import { z } from "zod";

const viewAsMerchantQuerySchema = z.object({
  viewAsMerchant: trimmedString(1, LIMITS.knownName.max).optional(),
});

export async function GET(
  request: NextRequest,
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
  const permissionKeys = (auth.context?.permissionKeys as string[]) ?? [];
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

  const viewAsParsed = viewAsMerchantQuerySchema.safeParse({
    viewAsMerchant:
      request.nextUrl.searchParams.get("viewAsMerchant") ?? undefined,
  });
  if (!viewAsParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: viewAsParsed.error.flatten() },
      { status: 400 }
    );
  }
  const viewAsMerchant = viewAsParsed.data.viewAsMerchant?.trim() || null;
  if (viewAsMerchant && !hasInsightAdminView(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Preview mode: history only if selected merchant would own the contact.
  if (viewAsMerchant) {
    const asMerchant = await viewerIdentityForMerchantFilter(
      companyId,
      viewAsMerchant
    );
    if (!asMerchant || !isAllocatedOwner(asMerchant, contact.assignedMerchant)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
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
  }

  const items = await listContactEventHistory({
    companyId,
    contactId: contact.id,
  });
  return NextResponse.json({ items });
}
