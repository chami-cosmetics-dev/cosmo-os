import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { DELIVERY_PAYMENT_APPROVAL, ORDER_PAYMENT_APPROVAL, RETURN_REARRANGE_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import { enrichApprovalDisplay } from "@/lib/approval-display";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAnyPermission([
    "finance.approvals.read",
    "finance.approvals.manage",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    type: string;
    status: string;
    orderId: string | null;
    orderReturnId: string | null;
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
        ar."orderReturnId",
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

  return NextResponse.json({
    approvals: rows.map((row) =>
      enrichApprovalDisplay({
        ...row,
        totalPrice: row.totalPrice?.toString() ?? null,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      })
    ),
  });
}
