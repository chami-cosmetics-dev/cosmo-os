import {
  isCallCenterCategory,
  type CallCenterCategory,
} from "@/lib/contact-call-center-categories";
import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

/** Legacy Insight marker — still counts as last-contacted, excluded from chart. */
export const CONTACTED_ALLOCATION_CATEGORY = "Contacted";

export async function getLastContactedAt(input: {
  companyId: string;
  contactId: string;
}): Promise<string | null> {
  const latest = await prisma.contactAllocationUpdate.findFirst({
    where: {
      companyId: input.companyId,
      contactId: input.contactId,
      NOT: { category: "allocation" },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return latest?.createdAt.toISOString() ?? null;
}

export async function markContactInsightContacted(input: {
  companyId: string;
  contactId: string;
  actorUserId: string | null | undefined;
  merchantName: string | null;
  category: CallCenterCategory;
  note?: string | null;
}): Promise<{ lastContactedAt: string; category: string } | null> {
  if (!isCallCenterCategory(input.category)) return null;

  const contact = await prisma.contactMaster.findFirst({
    where: { id: input.contactId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      recentMerchant: true,
      assignedMerchant: true,
    },
  });
  if (!contact) return null;

  const now = new Date();
  const merchantName =
    input.merchantName?.trim() ||
    contact.assignedMerchant?.trim() ||
    "Unknown";

  await prisma.$transaction(async (tx) => {
    await tx.contactMaster.update({
      where: { id: contact.id },
      data: { category: input.category },
    });
    await tx.contactAllocationUpdate.create({
      data: {
        companyId: input.companyId,
        contactId: contact.id,
        merchantId: input.actorUserId ?? null,
        merchantName,
        category: input.category,
      },
    });
  });

  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId ?? undefined,
    module: "contacts",
    action: "contact_follow_up_contacted",
    entityType: "ContactMaster",
    entityId: contact.id,
    summary: `Marked ${contact.name} as ${input.category} (Customer Insight)`,
    metadata: {
      note: input.note?.trim() || null,
      category: input.category,
      phoneNumber: contact.phoneNumber,
      email: contact.email,
      lastPurchaseAt: contact.lastPurchaseAt,
      recentMerchant: contact.recentMerchant,
      assignedMerchant: contact.assignedMerchant,
      source: "customer_insight",
    },
  });

  return { lastContactedAt: now.toISOString(), category: input.category };
}
