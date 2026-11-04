import "server-only";

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
  reconcileOrphanPendingPaymentApprovalsForPaidOrders,
  reconcilePendingApprovalsForErpResolvedOrders,
  reconcilePendingApprovalsForVoidedOrders,
  reconcilePendingDeliveryApprovalsForCourierOrders,
  reconcilePendingDeliveryApprovalsForCustomerPickupOrders,
  reconcilePendingDeliveryApprovalsForInvoiceCompleteOrders,
  reconcilePendingDeliveryApprovalsForPrepaidOrders,
  reconcilePendingOrderPaymentApprovalsForCardOnDelivery,
} from "@/lib/approval-workflow";
import { enrichApprovalDisplay } from "@/lib/approval-display";
import {
  loadKokoFieldsForApprovals,
  mergeKokoFieldsIntoApproval,
} from "@/lib/approval-koko-list";
import { buildErpAdminInvoiceUrl } from "@/lib/erp-admin-url";
import { financePaymentReferenceKind } from "@/lib/koko-approval-reference";
import {
  enrichApprovalsWithKokoDuplicateGroups,
  loadKokoDuplicateCandidatesForCompany,
} from "@/lib/koko-duplicate-cancel";
import { prisma } from "@/lib/prisma";
import { resolveReturnCancelCompletionMode } from "@/lib/return-cancel-completion";
import type { FinanceApprovalItem } from "@/components/organisms/finance-approvals-panel";
import {
  FINANCE_APPROVALS_HISTORY_LIMIT,
  FINANCE_APPROVALS_HISTORY_SEARCH_LIMIT,
  financeApprovalLikePattern,
  mergeFinanceApprovalSlices,
} from "@/lib/page-data/finance-approvals-slices";

export {
  FINANCE_APPROVALS_HISTORY_LIMIT,
  financeApprovalLikePattern,
  mergeFinanceApprovalSlices,
  mergeHistorySearchRows,
} from "@/lib/page-data/finance-approvals-slices";

type FinanceApprovalListRow = {
  id: string;
  type: string;
  status: string;
  orderId: string | null;
  requestNote: string | null;
  reviewNote: string | null;
  kokoReference: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  invoiceNo: string | null;
  totalPrice: Prisma.Decimal | null;
  customerPhone: string | null;
  customerEmail: string | null;
  orderLinked: boolean;
  requestedByName: string | null;
  requestedByEmail: string | null;
  reviewedByName: string | null;
  reviewedByEmail: string | null;
  shopifyOrderId: string | null;
  erpnextInvoiceId: string | null;
  financialStatus: string | null;
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
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
};

function locationFilterSql(financeLocationIds: string[] | null) {
  if (financeLocationIds === null) return Prisma.empty;
  if (financeLocationIds.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND COALESCE(o."companyLocationId", ort_order."companyLocationId") IN (${Prisma.join(financeLocationIds)})`;
}

function sliceFilterSql(slice: "pending" | "history") {
  return slice === "pending"
    ? Prisma.sql`AND ar."status" = 'pending'`
    : Prisma.sql`AND ar."status" <> 'pending'`;
}

function sliceOrderSql(slice: "pending" | "history") {
  return slice === "pending"
    ? Prisma.sql`ORDER BY ar."createdAt" DESC`
    : Prisma.sql`ORDER BY COALESCE(ar."reviewedAt", ar."createdAt") DESC`;
}

function historyOrderSearchSql(pattern: string | null) {
  if (!pattern) return Prisma.empty;
  return Prisma.sql`AND (
    o."name" ILIKE ${pattern}
    OR o."orderNumber" ILIKE ${pattern}
    OR o."shopifyOrderId" ILIKE ${pattern}
    OR o."erpnextInvoiceId" ILIKE ${pattern}
    OR ort_order."name" ILIKE ${pattern}
    OR ort_order."orderNumber" ILIKE ${pattern}
    OR ort_order."shopifyOrderId" ILIKE ${pattern}
    OR ort_order."erpnextInvoiceId" ILIKE ${pattern}
  )`;
}

function limitSql(limit: number | null) {
  return limit == null ? Prisma.empty : Prisma.sql`LIMIT ${limit}`;
}

async function queryFinanceApprovalSlice(input: {
  companyId: string;
  financeLocationIds: string[] | null;
  slice: "pending" | "history";
  limit?: number | null;
  searchPattern?: string | null;
}): Promise<FinanceApprovalListRow[]> {
  const locationFilter = locationFilterSql(input.financeLocationIds);
  const searchFilter =
    input.slice === "history" ? historyOrderSearchSql(input.searchPattern ?? null) : Prisma.empty;
  return prisma.$queryRaw<FinanceApprovalListRow[]>(Prisma.sql`
    SELECT
      ar."id",
      ar."type",
      ar."status",
      ar."orderId",
      ar."requestNote",
      ar."reviewNote",
      ar."kokoReference",
      ar."createdAt",
      ar."reviewedAt",
      COALESCE(o."name", o."orderNumber", o."shopifyOrderId") AS "invoiceNo",
      o."totalPrice",
      o."customerPhone",
      o."customerEmail",
      (o."id" IS NOT NULL) AS "orderLinked",
      COALESCE(reqUser."knownName", reqUser."name") AS "requestedByName",
      reqUser."email" AS "requestedByEmail",
      rev."name" AS "reviewedByName",
      rev."email" AS "reviewedByEmail",
      o."shopifyOrderId",
      COALESCE(o."erpnextInvoiceId", ort_order."erpnextInvoiceId") AS "erpnextInvoiceId",
      COALESCE(o."financialStatus", ort_order."financialStatus") AS "financialStatus",
      COALESCE(o."sourceName", ort_order."sourceName") AS "sourceName",
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
      rider."mobile" AS "riderMobile",
      o."paymentGatewayPrimary",
      COALESCE(o."paymentGatewayNames", ARRAY[]::TEXT[]) AS "paymentGatewayNames"
    FROM "ApprovalRequest" ar
    LEFT JOIN "Order" o ON o."id" = ar."orderId"
    LEFT JOIN "OrderReturn" ort ON ort."id" = ar."orderReturnId"
    LEFT JOIN "Order" ort_order ON ort_order."id" = ort."orderId"
    LEFT JOIN "CompanyLocation" cl ON cl."id" = COALESCE(o."companyLocationId", ort_order."companyLocationId")
    LEFT JOIN "ErpnextInstance" ei ON ei."id" = cl."erpnextInstanceId"
    LEFT JOIN "User" reqUser ON reqUser."id" = ar."requestedById"
    LEFT JOIN "User" rev ON rev."id" = ar."reviewedById"
    LEFT JOIN "User" returnedBy ON returnedBy."id" = ort."returnedById"
    LEFT JOIN "User" cancelBy ON cancelBy."id" = ort."actionById"
    LEFT JOIN "User" rider ON rider."id" = COALESCE(o."dispatchedByRiderId", ort_order."dispatchedByRiderId")
    WHERE ar."companyId" = ${input.companyId}
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
      ${sliceFilterSql(input.slice)}
      ${searchFilter}
      ${locationFilter}
    ${sliceOrderSql(input.slice)}
    ${limitSql(input.limit ?? null)}
  `);
}

function mapFinanceApprovalRows(
  rows: FinanceApprovalListRow[],
  kokoByApproval: Awaited<ReturnType<typeof loadKokoFieldsForApprovals>>,
  candidates: Awaited<ReturnType<typeof loadKokoDuplicateCandidatesForCompany>>,
): FinanceApprovalItem[] {
  const mapped = rows.map((row) => {
    const cancelNote =
      row.type === RETURN_CANCEL_APPROVAL
        ? parseReturnCancelApprovalNote(row.requestNote)
        : null;
    const isOrderCancel = row.type === ORDER_CANCEL_APPROVAL;
    const paymentReferenceKind = financePaymentReferenceKind({
      type: row.type,
      requestNote: row.requestNote,
      paymentGatewayPrimary: row.paymentGatewayPrimary,
      paymentGatewayNames: row.paymentGatewayNames,
    });
    const enriched = enrichApprovalDisplay({
      ...row,
      totalPrice: row.totalPrice?.toString() ?? null,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    });

    return mergeKokoFieldsIntoApproval(
      {
        ...enriched,
        shopifyOrderId: cancelNote?.shopifyOrderId ?? row.shopifyOrderId,
        erpnextInvoiceId: cancelNote?.erpnextInvoiceId ?? row.erpnextInvoiceId,
        erpAdminInvoiceUrl: buildErpAdminInvoiceUrl({
          baseUrl: row.erpBaseUrl,
          sourceName: row.sourceName,
          name: row.invoiceNo,
          erpnextInvoiceId: cancelNote?.erpnextInvoiceId ?? row.erpnextInvoiceId,
        }),
        completionMode:
          row.type === RETURN_CANCEL_APPROVAL || isOrderCancel
            ? resolveReturnCancelCompletionMode(row.financialStatus)
            : undefined,
        returnedByName: row.returnedByName,
        returnedByEmail: row.returnedByEmail,
        cancelRequestedByName: isOrderCancel
          ? row.reviewedByName
          : row.cancelRequestedByName,
        cancelRequestedByEmail: isOrderCancel
          ? row.reviewedByEmail
          : row.cancelRequestedByEmail,
        returnRemark: cancelNote?.returnRemark ?? row.returnRemark,
        cancelRemark: isOrderCancel
          ? row.requestNote
          : (cancelNote?.cancelRemark ?? row.cancelRemark),
        returnDate:
          cancelNote?.returnDate ?? row.returnDate?.toISOString() ?? null,
        cancelRequestedAt: isOrderCancel
          ? row.createdAt.toISOString()
          : (cancelNote?.cancelRequestedAt ??
            row.cancelRequestedAt?.toISOString() ??
            null),
        riderId: row.riderId,
        riderName: row.riderName,
        riderMobile: row.riderMobile,
        paymentReferenceKind,
        requiresKokoReference: paymentReferenceKind != null,
      },
      kokoByApproval,
    );
  });

  return enrichApprovalsWithKokoDuplicateGroups(mapped, candidates);
}

export async function reconcileFinanceApprovalsForList(companyId: string) {
  await Promise.all([
    reconcilePendingApprovalsForVoidedOrders(companyId),
    reconcilePendingApprovalsForErpResolvedOrders(companyId),
    reconcileOrphanPendingPaymentApprovalsForPaidOrders(companyId),
    reconcilePendingOrderPaymentApprovalsForCardOnDelivery(companyId),
    reconcilePendingDeliveryApprovalsForPrepaidOrders(companyId),
    reconcilePendingDeliveryApprovalsForInvoiceCompleteOrders(companyId),
    reconcilePendingDeliveryApprovalsForCourierOrders(companyId),
    reconcilePendingDeliveryApprovalsForCustomerPickupOrders(companyId),
  ]);
}

export async function listFinanceApprovals(input: {
  companyId: string;
  financeLocationIds: string[] | null;
  historyQuery?: string | null;
  includePending?: boolean;
}): Promise<FinanceApprovalItem[]> {
  const includePending = input.includePending !== false;
  const searchPattern = financeApprovalLikePattern(input.historyQuery ?? "");
  const [pendingRows, historyRows] = await Promise.all([
    includePending
      ? queryFinanceApprovalSlice({
          companyId: input.companyId,
          financeLocationIds: input.financeLocationIds,
          slice: "pending",
        })
      : Promise.resolve([]),
    queryFinanceApprovalSlice({
      companyId: input.companyId,
      financeLocationIds: input.financeLocationIds,
      slice: "history",
      searchPattern,
      limit: searchPattern
        ? FINANCE_APPROVALS_HISTORY_SEARCH_LIMIT
        : FINANCE_APPROVALS_HISTORY_LIMIT,
    }),
  ]);
  const rows = mergeFinanceApprovalSlices(pendingRows, historyRows);
  const [kokoByApproval, candidates] = await Promise.all([
    loadKokoFieldsForApprovals(rows.map((row) => row.id)),
    loadKokoDuplicateCandidatesForCompany(input.companyId),
  ]);
  return mapFinanceApprovalRows(rows, kokoByApproval, candidates);
}
