import { Prisma } from "@prisma/client";

import {
  orderCancelFinanceCc,
  resolveCancelFinanceLocationId,
  type CancelFinanceLocation,
  type CancelPrefixAccount,
} from "@/lib/order-cancel-finance";
import { sendOrderCancelRequestEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";

const FINANCE_APPROVAL_PERMISSION = "finance.approvals.manage";

async function loadPrefixCatalog(companyId: string): Promise<{
  locations: CancelFinanceLocation[];
  prefixAccounts: CancelPrefixAccount[];
}> {
  const [locations, citypak, koko] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        shortName: true,
        manualInvoicePrefix: true,
        locationReference: true,
      },
    }),
    prisma.citypakAccount.findMany({
      where: { companyId },
      select: { invoicePrefix: true, label: true },
    }),
    prisma.kokoCompany.findMany({
      where: { companyId },
      select: { invoicePrefix: true, label: true },
    }),
  ]);

  return {
    locations,
    prefixAccounts: [...citypak, ...koko],
  };
}

/** Location whose finance users should receive this cancel request. */
export async function resolveOrderCancelFinanceLocationId(input: {
  companyId: string;
  companyLocationId?: string | null;
  orderRefs: Array<string | null | undefined>;
}): Promise<string | null> {
  const catalog = await loadPrefixCatalog(input.companyId);
  return resolveCancelFinanceLocationId({
    orderCompanyLocationId: input.companyLocationId,
    orderRefs: input.orderRefs,
    locations: catalog.locations,
    prefixAccounts: catalog.prefixAccounts,
  });
}

/**
 * Finance users explicitly scoped to this company location.
 * Empty scope rows are a company-wide fallback, used only when nobody is assigned.
 */
export async function listOrderCancelFinanceEmailUsers(
  companyId: string,
  locationId: string | null,
): Promise<Array<{ id: string; email: string | null }>> {
  if (locationId) {
    const scoped = await prisma.$queryRaw<Array<{ id: string; email: string | null }>>(
      Prisma.sql`
        SELECT DISTINCT u."id", u."email"
        FROM "User" u
        JOIN "UserRole" ur ON ur."userId" = u."id"
        JOIN "Role" r ON r."id" = ur."roleId"
        LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
        LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
        WHERE u."companyId" = ${companyId}
          AND u."email" IS NOT NULL
          AND (
            p."key" = ${FINANCE_APPROVAL_PERMISSION}
            OR r."name" IN ('admin', 'super_admin')
          )
          AND EXISTS (
            SELECT 1 FROM "UserFinanceScope" ufs
            WHERE ufs."userId" = u."id"
              AND ufs."locationId" = ${locationId}
          )
      `,
    );
    if (scoped.length > 0) return scoped;
  }

  const includeCompanyWide = locationId === null;
  return prisma.$queryRaw<Array<{ id: string; email: string | null }>>(
    Prisma.sql`
      SELECT DISTINCT u."id", u."email"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
      LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE u."companyId" = ${companyId}
        AND u."email" IS NOT NULL
        AND (
          p."key" = ${FINANCE_APPROVAL_PERMISSION}
          OR r."name" IN ('admin', 'super_admin')
        )
        AND (
          ${includeCompanyWide} = true
          OR NOT EXISTS (
            SELECT 1 FROM "UserFinanceScope" ufs2
            WHERE ufs2."userId" = u."id"
              AND ufs2."companyId" = ${companyId}
          )
        )
    `,
  );
}

export async function emailOrderCancelFinanceRequest(input: {
  companyId: string;
  locationId: string | null;
  invoiceLabel: string;
  amount: string;
  cancelReason: string;
  isPos: boolean;
}): Promise<void> {
  try {
    const users = await listOrderCancelFinanceEmailUsers(input.companyId, input.locationId);
    const toEmails = [
      ...new Set(
        users
          .map((user) => user.email?.trim().toLowerCase() ?? "")
          .filter((email) => email.includes("@")),
      ),
    ];
    if (toEmails.length === 0) {
      console.warn("[order-cancel] no finance email for", input.invoiceLabel);
      return;
    }

    const result = await sendOrderCancelRequestEmail({
      toEmails,
      ccEmails: orderCancelFinanceCc(input.isPos),
      invoiceLabel: input.invoiceLabel,
      amount: input.amount,
      cancelReason: input.cancelReason,
      isPos: input.isPos,
    });
    if (!result.success) {
      console.error("[order-cancel] finance email failed:", result.message);
    }
  } catch (error) {
    console.error("[order-cancel] finance email failed:", error);
  }
}
