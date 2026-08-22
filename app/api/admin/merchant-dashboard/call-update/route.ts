import { NextRequest, NextResponse } from "next/server";

import { getMerchantDisplayName } from "@/lib/customer-insight/auto-allocate";
import {
  CALL_QUEUE_STATUS_PENDING,
  completeCallQueueItem,
} from "@/lib/customer-insight/call-queue";
import { markContactInsightContacted } from "@/lib/customer-insight/contacted";
import { isAllocatedOwner } from "@/lib/customer-insight/ownership";
import {
  canAccessMerchantDashboard,
  hasMerchantDashboardAdminView,
} from "@/lib/merchant-role";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { merchantCallUpdateBodySchema } from "@/lib/validation/customer-insight";

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roleNames = (context.roleNames ?? []) as string[];
  const allowed =
    canAccessMerchantDashboard(roleNames) ||
    hasPermission(context, "dashboard.merchant_view") ||
    hasPermission(context, "contacts.insight.read");
  if (!allowed) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const companyId = context.user.companyId ?? null;
  const user = context.user;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = merchantCallUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const viewerIsAdmin = hasMerchantDashboardAdminView({
    roleNames,
    permissionKeys: context.permissionKeys as string[] | undefined,
  });

  const creditUserId =
    viewerIsAdmin && parsed.data.merchantUserId
      ? parsed.data.merchantUserId
      : user.id;

  const creditUser = await prisma.user.findFirst({
    where: { id: creditUserId, companyId },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
    },
  });
  if (!creditUser) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: parsed.data.contactId, companyId },
    select: { id: true, assignedMerchant: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

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
    permissionKeys: context.permissionKeys as string[] | undefined,
  };

  if (!viewerIsAdmin && !isAllocatedOwner(viewer, contact.assignedMerchant)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const creditLabel = getMerchantDisplayName(creditUser);
  const queueRow = await prisma.contactInsightCallQueue.findFirst({
    where: {
      companyId,
      contactId: contact.id,
      status: CALL_QUEUE_STATUS_PENDING,
      OR: [
        { merchantUserId: creditUser.id },
        ...(creditLabel
          ? [
              {
                merchantLabel: {
                  equals: creditLabel,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  if (!queueRow) {
    return NextResponse.json(
      { error: "Contact is not in your assigned call update queue" },
      { status: 404 }
    );
  }

  const result = await markContactInsightContacted({
    companyId,
    contactId: contact.id,
    actorUserId: creditUser.id,
    merchantName: getMerchantDisplayName(creditUser) ?? contact.assignedMerchant,
    category: parsed.data.category,
    remark: parsed.data.remark,
    outcome: "general",
  });
  if (!result) {
    return NextResponse.json({ error: "Invalid call outcome" }, { status: 400 });
  }

  await completeCallQueueItem({
    companyId,
    contactId: contact.id,
    completedByUserId: user.id,
  });

  return NextResponse.json(result);
}
