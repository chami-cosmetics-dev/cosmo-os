import { Prisma } from "@prisma/client";

import { createNotification } from "@/lib/approval-workflow";
import { MERCHANT_DASHBOARD_ADMIN_PERMISSION } from "@/lib/merchant-role";
import { prisma } from "@/lib/prisma";

export function loyaltyRespondedRecipientIds(
  userIds: string[],
  actorUserId: string
): string[] {
  return [...new Set(userIds)].filter((id) => id !== actorUserId);
}

export async function listMerchantDashboardAdminUserIds(
  companyId: string
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT DISTINCT u."id"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
      LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE u."companyId" = ${companyId}
        AND (
          p."key" = ${MERCHANT_DASHBOARD_ADMIN_PERMISSION}
          OR r."name" IN ('admin', 'super_admin')
        )
    `
  );
  return rows.map((row) => row.id);
}

export async function notifyMerchantAdminsLoyaltyResponded(input: {
  companyId: string;
  contactId: string;
  contactName: string;
  actorUserId: string;
  actorName?: string | null;
  eligibleLabel?: string | null;
  erpGroup?: string | null;
  shopifyTag?: string | null;
}): Promise<void> {
  const ids = loyaltyRespondedRecipientIds(
    await listMerchantDashboardAdminUserIds(input.companyId),
    input.actorUserId
  );
  if (ids.length === 0) return;
  const actor = input.actorName?.trim();
  const eligible = input.eligibleLabel
    ? ` Eligible: ${input.eligibleLabel}` +
      (input.erpGroup ? ` (ERP ${input.erpGroup}` : "") +
      (input.shopifyTag ? `${input.erpGroup ? " · " : " ("}Shopify “${input.shopifyTag}”` : "") +
      (input.erpGroup || input.shopifyTag ? ")" : "") +
      "."
    : " Assign Gold/Platinum in Customer Insight.";
  const body = actor
    ? `${input.contactName} responded after loyalty outreach (${actor}).${eligible}`
    : `${input.contactName} responded after loyalty outreach.${eligible}`;
  await Promise.all(
    ids.map((userId) =>
      createNotification({
        companyId: input.companyId,
        userId,
        type: "loyalty_responded",
        title: "Loyalty customer responded",
        body,
        entityType: "ContactMaster",
        entityId: input.contactId,
      })
    )
  );
}
