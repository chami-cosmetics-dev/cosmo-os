import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { FinanceApprovalsPanel, type FinanceApprovalItem } from "@/components/organisms/finance-approvals-panel";
import { DELIVERY_PAYMENT_APPROVAL, ORDER_PAYMENT_APPROVAL, RETURN_REARRANGE_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import { enrichApprovalDisplay } from "@/lib/approval-display";
import { prisma } from "@/lib/prisma";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function fetchInitialApprovals(companyId: string): Promise<FinanceApprovalItem[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    type: string;
    status: string;
    orderId: string | null;
    requestNote: string | null;
    reviewNote: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
    invoiceNo: string | null;
    totalPrice: Prisma.Decimal | null;
    customerPhone: string | null;
    customerEmail: string | null;
    orderLinked: boolean;
    reviewedByName: string | null;
    reviewedByEmail: string | null;
  }>>(
    Prisma.sql`
      SELECT
        ar."id",
        ar."type",
        ar."status",
        ar."orderId",
        ar."requestNote",
        ar."reviewNote",
        ar."createdAt",
        ar."reviewedAt",
        COALESCE(o."name", o."orderNumber", o."shopifyOrderId") AS "invoiceNo",
        o."totalPrice",
        o."customerPhone",
        o."customerEmail",
        (o."id" IS NOT NULL) AS "orderLinked",
        rev."name" AS "reviewedByName",
        rev."email" AS "reviewedByEmail"
      FROM "ApprovalRequest" ar
      LEFT JOIN "Order" o ON o."id" = ar."orderId"
      LEFT JOIN "User" rev ON rev."id" = ar."reviewedById"
      WHERE ar."companyId" = ${companyId}
        AND ar."type" IN (${RETURN_REARRANGE_PAYMENT_APPROVAL}, ${ORDER_PAYMENT_APPROVAL}, ${DELIVERY_PAYMENT_APPROVAL})
      ORDER BY
        CASE WHEN ar."status" = 'pending' THEN 0 ELSE 1 END,
        ar."createdAt" DESC
      LIMIT 100
    `
  );

  return rows.map((row) =>
    enrichApprovalDisplay({
      ...row,
      totalPrice: row.totalPrice?.toString() ?? null,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    })
  );
}

export default async function FinanceApprovalsPage() {
  const auth = await requireAnyPermission([
    "finance.approvals.read",
    "finance.approvals.manage",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) return <PermissionDeniedCard message="No company associated with your account." />;

  const approvals = await fetchInitialApprovals(companyId);
  const canRevertPaid = hasPermission(auth.context!, "finance.hod.revert_paid_to_unpaid");
  return <FinanceApprovalsPanel initialApprovals={approvals} canRevertPaid={canRevertPaid} />;
}
