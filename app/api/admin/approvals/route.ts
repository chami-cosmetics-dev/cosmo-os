import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  DELIVERY_PAYMENT_APPROVAL,
  DELIVERY_PAYMENT_FINANCE_UI_ENABLED,
  INVOICE_REVERT_VOID_APPROVAL,
  ORDER_CANCEL_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
  PAYMENT_METHOD_CHANGE_APPROVAL,
  RETURN_CANCEL_APPROVAL,
  RETURN_REARRANGE_PAYMENT_APPROVAL,
  parseReturnCancelApprovalNote,
  reconcilePendingApprovalsForVoidedOrders,
  reconcilePendingDeliveryApprovalsForCourierOrders,
  reconcilePendingDeliveryApprovalsForCustomerPickupOrders,
  reconcilePendingDeliveryApprovalsForInvoiceCompleteOrders,
  resolveViewerFinanceLocationIds,
} from "@/lib/approval-workflow";
import { enrichApprovalDisplay } from "@/lib/approval-display";
import { buildErpAdminInvoiceUrl } from "@/lib/erp-admin-url";
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
  const userId = auth.context?.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const financeLocationIds = await resolveViewerFinanceLocationIds(
    userId,
    companyId,
    (auth.context?.roleNames as string[]) ?? []
  );

  await Promise.all([
    reconcilePendingApprovalsForVoidedOrders(companyId),
    reconcilePendingDeliveryApprovalsForInvoiceCompleteOrders(companyId),
    reconcilePendingDeliveryApprovalsForCourierOrders(companyId),
    reconcilePendingDeliveryApprovalsForCustomerPickupOrders(companyId),
  ]);

  const locationFilter =
    financeLocationIds === null
      ? Prisma.empty
      : financeLocationIds.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND COALESCE(o."companyLocationId", ort_order."companyLocationId") IN (${Prisma.join(financeLocationIds)})`;

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
    shopifyOrderId: string | null;
    erpnextInvoiceId: string | null;
    sourceName: string | null;
    erpBaseUrl: string | null;
    returnedByName: string | null;
    returnedByEmail: string | null;
    cancelRequestedByName: string | null;
    cancelRequestedByEmail: string | null;
    returnRemark: string | null;
    cancelRemark: string | null;
    returnDate: Date | null;
    cancelRequestedAt: Date | null;
    riderId: string | null;
    riderName: string | null;
    riderMobile: string | null;
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
        rev."email" AS "reviewedByEmail",
        o."shopifyOrderId",
        o."erpnextInvoiceId",
        o."sourceName",
        ei."baseUrl" AS "erpBaseUrl",
        returnedBy."name" AS "returnedByName",
        returnedBy."email" AS "returnedByEmail",
        cancelBy."name" AS "cancelRequestedByName",
        cancelBy."email" AS "cancelRequestedByEmail",
        ort."returnRemark",
        ort."cancelRemark",
        ort."returnDate",
        ort."cancelRequestedAt",
        rider."id" AS "riderId",
        COALESCE(rider."knownName", rider."name") AS "riderName",
        rider."mobile" AS "riderMobile"
      FROM "ApprovalRequest" ar
      LEFT JOIN "Order" o ON o."id" = ar."orderId"
      LEFT JOIN "CompanyLocation" cl ON cl."id" = o."companyLocationId"
      LEFT JOIN "ErpnextInstance" ei ON ei."id" = cl."erpnextInstanceId"
      LEFT JOIN "User" rev ON rev."id" = ar."reviewedById"
      LEFT JOIN "OrderReturn" ort ON ort."id" = ar."orderReturnId"
      LEFT JOIN "Order" ort_order ON ort_order."id" = ort."orderId"
      LEFT JOIN "User" returnedBy ON returnedBy."id" = ort."returnedById"
      LEFT JOIN "User" cancelBy ON cancelBy."id" = ort."actionById"
      LEFT JOIN "User" rider ON rider."id" = o."dispatchedByRiderId"
      WHERE ar."companyId" = ${companyId}
        AND ar."type" IN (
          ${RETURN_REARRANGE_PAYMENT_APPROVAL},
          ${RETURN_CANCEL_APPROVAL},
          ${ORDER_PAYMENT_APPROVAL},
          ${DELIVERY_PAYMENT_APPROVAL},
          ${INVOICE_REVERT_VOID_APPROVAL},
          ${PAYMENT_METHOD_CHANGE_APPROVAL},
          ${ORDER_CANCEL_APPROVAL}
        )
        AND (${DELIVERY_PAYMENT_FINANCE_UI_ENABLED} OR ar."type" <> ${DELIVERY_PAYMENT_APPROVAL})
        ${locationFilter}
      ORDER BY
        CASE WHEN ar."status" = 'pending' THEN 0 ELSE 1 END,
        ar."createdAt" DESC
      LIMIT 100
    `
  );

  return NextResponse.json({
    approvals: rows.map((row) => {
      const cancelNote = row.type === RETURN_CANCEL_APPROVAL ? parseReturnCancelApprovalNote(row.requestNote) : null;
      const enriched = enrichApprovalDisplay({
        ...row,
        totalPrice: row.totalPrice?.toString() ?? null,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      });

      const isOrderCancel = row.type === ORDER_CANCEL_APPROVAL;
      return {
        ...enriched,
        shopifyOrderId: cancelNote?.shopifyOrderId ?? row.shopifyOrderId,
        erpnextInvoiceId: cancelNote?.erpnextInvoiceId ?? row.erpnextInvoiceId,
        erpAdminInvoiceUrl: buildErpAdminInvoiceUrl({
          baseUrl: row.erpBaseUrl,
          sourceName: row.sourceName,
          name: row.invoiceNo,
          erpnextInvoiceId: cancelNote?.erpnextInvoiceId ?? row.erpnextInvoiceId,
        }),
        returnedByName: row.returnedByName,
        returnedByEmail: row.returnedByEmail,
        cancelRequestedByName: isOrderCancel ? row.reviewedByName : row.cancelRequestedByName,
        cancelRequestedByEmail: isOrderCancel ? row.reviewedByEmail : row.cancelRequestedByEmail,
        returnRemark: cancelNote?.returnRemark ?? row.returnRemark,
        cancelRemark: isOrderCancel ? row.requestNote : (cancelNote?.cancelRemark ?? row.cancelRemark),
        returnDate: cancelNote?.returnDate ?? row.returnDate?.toISOString() ?? null,
        cancelRequestedAt: isOrderCancel ? row.createdAt.toISOString() : (cancelNote?.cancelRequestedAt ?? row.cancelRequestedAt?.toISOString() ?? null),
        riderId: row.riderId,
        riderName: row.riderName,
        riderMobile: row.riderMobile,
      };
    }),
  });
}
