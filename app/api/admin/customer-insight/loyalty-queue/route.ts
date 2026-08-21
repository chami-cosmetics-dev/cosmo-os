import { NextResponse } from "next/server";

import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import { pendingLoyaltySuggestion } from "@/lib/customer-insight/loyalty-outreach";
import { getLoyaltyProfileMissingFields } from "@/lib/customer-insight/loyalty-profile-complete";
import { loyaltyExternalTargets } from "@/lib/customer-insight/loyalty-push";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requireAnyPermission([
    "contacts.master.read",
    "contacts.master.manage",
    "dashboard.merchant_admin_view",
  ]);
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

  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      loyaltyOutreachStatus: "responded",
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      assignedMerchant: true,
      email: true,
      gender: true,
      language: true,
      birthMonth: true,
      birthDay: true,
      city: true,
      address: true,
      loyaltyAssignedTier: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });

  const lifetimeById = await lifetimeTotalsByContactId(companyId, contacts);

  const items = [];
  for (const c of contacts) {
    const lifetimeTotal = lifetimeById.get(c.id) ?? 0;
    const pending = pendingLoyaltySuggestion(c.loyaltyAssignedTier, lifetimeTotal);
    if (!pending) continue;

    const targets = loyaltyExternalTargets(pending.suggestedTier);
    items.push({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      lifetimeTotal,
      suggestedTier: pending.suggestedTier,
      suggestionKind: pending.kind,
      currentAssignedTier: pending.currentAssigned,
      eligibleGroup: targets.label,
      erpGroup: targets.erpGroup,
      shopifyTag: targets.shopifyTag,
      assignedMerchant: c.assignedMerchant,
      missingProfileFields: getLoyaltyProfileMissingFields({
        name: c.name,
        email: c.email,
        phoneNumber: c.phoneNumber,
        phones: c.phones.map((p) => p.phoneNumber),
        gender: c.gender,
        language: c.language,
        birthMonth: c.birthMonth,
        birthDay: c.birthDay,
        city: c.city,
        address: c.address,
      }),
    });
  }

  items.sort((a, b) => b.lifetimeTotal - a.lifetimeTotal);

  return NextResponse.json({ items });
}
