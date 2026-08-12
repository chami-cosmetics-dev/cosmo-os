import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { computeLifetimeTotal, customerLifetimeTotalOrderWhere } from "@/lib/customer-insight/lifetime-total";
import { nextOutreachStatus, suggestedLoyaltyTier } from "@/lib/customer-insight/loyalty-outreach";
import { notifyMerchantAdminsLoyaltyResponded } from "@/lib/customer-insight/loyalty-notify";
import { loyaltyExternalTargets } from "@/lib/customer-insight/loyalty-push";
import { isAllocatedOwner } from "@/lib/customer-insight/ownership";
import {
  canAccessMerchantDashboard,
  hasMerchantDashboardAdminView,
} from "@/lib/merchant-role";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { merchantLoyaltyOutreachBodySchema } from "@/lib/validation/customer-insight";

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roleNames = (context.roleNames ?? []) as string[];
  const allowed =
    canAccessMerchantDashboard(roleNames) ||
    hasPermission(context, "dashboard.merchant_view");
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
  const parsed = merchantLoyaltyOutreachBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: parsed.data.contactId, companyId },
    select: { id: true, name: true, assignedMerchant: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const viewerIsAdmin = hasMerchantDashboardAdminView({
    roleNames,
    permissionKeys: context.permissionKeys as string[] | undefined,
  });
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

  const status = nextOutreachStatus(parsed.data.action);
  const remark = parsed.data.remark?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.contactMaster.update({
      where: { id: contact.id },
      data: { loyaltyOutreachStatus: status },
    });
    await tx.contactAllocationUpdate.create({
      data: {
        companyId,
        contactId: contact.id,
        merchantId: user.id,
        merchantName: user.knownName ?? user.name ?? null,
        category: "Contacted",
        remark,
        outcome: parsed.data.action,
      },
    });
  });

  await writeAuditLog({
    companyId,
    actorUserId: user.id,
    module: "merchant-dashboard",
    action:
      parsed.data.action === "responded" ||
      parsed.data.action === "not_responded"
        ? "loyalty_responded"
        : "merchant_loyalty_contacted",
    entityType: "ContactMaster",
    entityId: contact.id,
    summary: `Loyalty outreach ${parsed.data.action} for ${contact.name}`,
    metadata: { action: parsed.data.action, remark, status },
  });

  if (parsed.data.action === "responded") {
    try {
      const emails = await listContactEmails(contact.id, null);
      const phones = await listContactPhones(contact.id, null);
      const orderLookupOr = buildContactOrderLookupOr({ phones, emails });
      const [orders, adaptRows] = await Promise.all([
        orderLookupOr.length > 0
          ? prisma.order.findMany({
              where: {
                companyId,
                OR: orderLookupOr,
                ...customerLifetimeTotalOrderWhere(),
              },
              select: {
                totalPrice: true,
                cancelledAt: true,
                financialStatus: true,
                fulfillmentStage: true,
              },
            })
          : Promise.resolve([]),
        prisma.adaptPurchaseHistory.findMany({
          where: { contactId: contact.id, companyId },
          select: { ttlAmount: true },
        }),
      ]);
      const lifetimeTotal = computeLifetimeTotal({
        orders: orders.map((o) => ({
          totalPrice: o.totalPrice.toString(),
          cancelledAt: o.cancelledAt,
          financialStatus: o.financialStatus,
          fulfillmentStage: o.fulfillmentStage,
        })),
        adaptRows: adaptRows.map((r) => ({ ttlAmount: r.ttlAmount.toString() })),
      });
      const suggested = suggestedLoyaltyTier(lifetimeTotal);
      const targets = suggested ? loyaltyExternalTargets(suggested) : null;
      await notifyMerchantAdminsLoyaltyResponded({
        companyId,
        contactId: contact.id,
        contactName: contact.name,
        actorUserId: user.id,
        actorName: user.knownName ?? user.name ?? null,
        eligibleLabel: targets?.label ?? null,
        erpGroup: targets?.erpGroup ?? null,
        shopifyTag: targets?.shopifyTag ?? null,
      });
    } catch (err) {
      console.error("[loyalty-outreach] notify merchant admins failed", err);
    }
  }

  return NextResponse.json({ ok: true, status });
}
