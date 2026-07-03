import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendFinanceApprovalEmail } from "@/lib/maileroo";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export const ORDER_VOIDED_APPROVAL_CANCEL_NOTE =
  "Order voided — approval no longer required";
export const RETURN_REARRANGE_PAYMENT_APPROVAL = "return_rearrange_payment";
export const RETURN_CANCEL_APPROVAL = "return_cancel";
export const ORDER_PAYMENT_APPROVAL = "order_payment_approval";
export const DELIVERY_PAYMENT_APPROVAL = "delivery_payment_approval";
export const INVOICE_REVERT_VOID_APPROVAL = "invoice_revert_void_approval";
export const PAYMENT_METHOD_CHANGE_APPROVAL = "payment_method_change_approval";
/** When false, delivery payment approvals stay in DB but are hidden from finance UI (notifications + approvals list). */
export const DELIVERY_PAYMENT_FINANCE_UI_ENABLED = true;
export const FINANCE_APPROVAL_TYPES = [
  RETURN_REARRANGE_PAYMENT_APPROVAL,
  RETURN_CANCEL_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
  DELIVERY_PAYMENT_APPROVAL,
  INVOICE_REVERT_VOID_APPROVAL,
  PAYMENT_METHOD_CHANGE_APPROVAL,
] as const;
const FINANCE_APPROVAL_PERMISSION = "finance.approvals.manage";

function normalizeFinancialStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

/** Unpaid orders must not be auto-marked paid on delivery — finance confirms collection first. */
export function orderRequiresDeliveryPaymentApproval(order: {
  financialStatus: string | null;
}): boolean {
  const status = normalizeFinancialStatus(order.financialStatus);
  return status !== "paid" && status !== "voided";
}

type NotificationInput = {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export async function createNotification(input: NotificationInput) {
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "Notification" (
        "id",
        "companyId",
        "userId",
        "type",
        "title",
        "body",
        "entityType",
        "entityId",
        "createdAt"
      )
      VALUES (
        ${randomUUID()},
        ${input.companyId},
        ${input.userId},
        ${input.type},
        ${input.title},
        ${input.body ?? null},
        ${input.entityType ?? null},
        ${input.entityId ?? null},
        ${new Date()}
      )
    `
  );
}

export async function getFinanceApprovalUsers(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; email: string | null }>>(
    Prisma.sql`
      SELECT DISTINCT u."id", u."email"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      LEFT JOIN "RolePermission" rp ON rp."roleId" = ur."roleId"
      LEFT JOIN "Permission" p ON p."id" = rp."permissionId"
      WHERE u."companyId" = ${companyId}
        AND (
          p."key" = ${FINANCE_APPROVAL_PERMISSION}
          OR r."name" IN ('admin', 'super_admin')
        )
    `
  );
  return rows;
}

export async function getFinanceApprovalUserIds(companyId: string) {
  const users = await getFinanceApprovalUsers(companyId);
  return users.map((u) => u.id);
}

export function isOrderPaymentRequiresApproval(order: {
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}): boolean {
  // When primary is known, check only that — paymentGatewayNames includes all
  // payment methods available at checkout, not just the one the customer used,
  // which causes false positives (e.g. "Bank Deposit" alongside a COD order).
  if (order.paymentGatewayPrimary) {
    const g = order.paymentGatewayPrimary.toLowerCase().trim();
    return g.includes("koko") || g.includes("bank");
  }
  const gateways = order.paymentGatewayNames
    .map((g) => g.toLowerCase().trim())
    .filter(Boolean);
  return gateways.some((g) => g.includes("koko") || g.includes("bank"));
}

export function isPlaceholderErpInvoiceId(id: string | null | undefined) {
  const trimmed = id?.trim();
  return !trimmed || trimmed === "pending" || trimmed === "pending_approval";
}

/** Keep finance-pending KOKO/bank orders out of fulfillment queues. */
// NOT { OR [A, B] } has a SQL NULL trap: when erpnextInvoiceId IS NULL,
// `NULL = 'pending_approval'` → NULL, so NOT(... OR NULL) = NULL = false,
// silently dropping orders whose ERP sync failed (erpnextInvoiceId never set).
// Fix: use `none` for the relation (NOT EXISTS) and explicit OR-null for the string field.
export const FINANCE_PENDING_FULFILLMENT_EXCLUSION = {
  approvalRequests: {
    none: { type: ORDER_PAYMENT_APPROVAL, status: "pending" },
  },
  OR: [
    { erpnextInvoiceId: null },
    { erpnextInvoiceId: { not: "pending_approval" } },
  ],
} satisfies Prisma.OrderWhereInput;

const voidedOrderFinancialStatusFilter = {
  equals: "voided",
  mode: "insensitive" as const,
};

/** Cancel open finance approvals when an order is voided (KOKO, bank transfer, etc.). */
export async function cancelPendingApprovalsForOrder(orderId: string) {
  const now = new Date();
  const data = {
    status: "cancelled" as const,
    reviewNote: ORDER_VOIDED_APPROVAL_CANCEL_NOTE,
    updatedAt: now,
  };

  const [direct, viaReturn] = await Promise.all([
    prisma.approvalRequest.updateMany({
      where: { status: "pending", orderId },
      data,
    }),
    prisma.approvalRequest.updateMany({
      where: {
        status: "pending",
        orderReturn: { orderId },
      },
      data,
    }),
  ]);

  // The cancel request is now moot — order is voided. Mark the return as solved
  // so it no longer shows as "Cancel Pending" in the returns panel.
  await prisma.orderReturn.updateMany({
    where: { orderId, actionType: "cancel", actionStatus: "pending" },
    data: { actionStatus: "solved", actionDate: now },
  });

  return direct.count + viaReturn.count;
}

/** Cancel pending delivery payment approvals for orders already at invoice_complete.
 * Handles the case where an order was bulk-completed or manually advanced to invoice_complete
 * while a DELIVERY_PAYMENT_APPROVAL was still pending in the finance queue. */
export async function reconcilePendingDeliveryApprovalsForInvoiceCompleteOrders(companyId: string) {
  const now = new Date();
  await prisma.approvalRequest.updateMany({
    where: {
      companyId,
      status: "pending",
      type: DELIVERY_PAYMENT_APPROVAL,
      order: { fulfillmentStage: "invoice_complete" },
    },
    data: {
      status: "cancelled",
      reviewNote: "Order already marked invoice complete.",
      updatedAt: now,
    },
  });
}

/** Cancel pending delivery payment approvals for orders dispatched by a courier service (e.g. Citypack).
 * Courier deliveries don't require finance to confirm cash collection — payment is handled by the courier. */
export async function reconcilePendingDeliveryApprovalsForCourierOrders(companyId: string) {
  const now = new Date();
  await prisma.approvalRequest.updateMany({
    where: {
      companyId,
      status: "pending",
      type: DELIVERY_PAYMENT_APPROVAL,
      order: { dispatchedByCourierServiceId: { not: null } },
    },
    data: {
      status: "cancelled",
      reviewNote: "Delivered by courier service — no payment collection confirmation needed.",
      updatedAt: now,
    },
  });
}

/** Cancel pending delivery payment approvals for customer-pickup orders.
 * Payment is collected at the counter — no rider payment confirmation needed. */
export async function reconcilePendingDeliveryApprovalsForCustomerPickupOrders(companyId: string) {
  const now = new Date();
  await prisma.approvalRequest.updateMany({
    where: {
      companyId,
      status: "pending",
      type: DELIVERY_PAYMENT_APPROVAL,
      order: { dispatchedToCustomer: true },
    },
    data: {
      status: "cancelled",
      reviewNote: "Customer pickup — payment collected in-store, no confirmation needed.",
      updatedAt: now,
    },
  });
}

/** Clear stale payment approvals for orders already voided in Vault.
 * Only cancels ORDER_PAYMENT_APPROVAL and DELIVERY_PAYMENT_APPROVAL — never
 * RETURN_CANCEL_APPROVAL or RETURN_REARRANGE_PAYMENT_APPROVAL, because returned
 * orders always have financialStatus="voided" and those approvals must stay pending
 * until finance explicitly acts on them. */
export async function reconcilePendingApprovalsForVoidedOrders(companyId: string) {
  const now = new Date();
  const data = {
    status: "cancelled" as const,
    reviewNote: ORDER_VOIDED_APPROVAL_CANCEL_NOTE,
    updatedAt: now,
  };
  const paymentTypes = [ORDER_PAYMENT_APPROVAL, DELIVERY_PAYMENT_APPROVAL, PAYMENT_METHOD_CHANGE_APPROVAL];

  const [direct, viaReturn] = await Promise.all([
    prisma.approvalRequest.updateMany({
      where: {
        companyId,
        status: "pending",
        type: { in: paymentTypes },
        order: { financialStatus: voidedOrderFinancialStatusFilter },
      },
      data,
    }),
    prisma.approvalRequest.updateMany({
      where: {
        companyId,
        status: "pending",
        type: { in: paymentTypes },
        orderReturn: {
          order: { financialStatus: voidedOrderFinancialStatusFilter },
        },
      },
      data,
    }),
  ]);

  return direct.count + viaReturn.count;
}

export async function getOrderPaymentApproval(orderId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "type" = ${ORDER_PAYMENT_APPROVAL}
        AND "orderId" = ${orderId}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  return rows[0] ?? null;
}

/** Block fulfillment actions until finance approves KOKO/bank payment. */
export async function getFinancePaymentApprovalBlockReason(order: {
  id: string;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
  erpnextInvoiceId?: string | null;
}): Promise<string | null> {
  if (order.erpnextInvoiceId === "pending_approval") {
    return "Finance approval is pending for this order. Please wait for the finance team to approve.";
  }
  if (!isOrderPaymentRequiresApproval(order)) return null;

  const approval = await getOrderPaymentApproval(order.id);
  if (!approval || approval.status === "pending") {
    return "Finance approval is pending for this order. Please wait for the finance team to approve.";
  }
  if (approval.status === "rejected") {
    return "Finance approval was rejected. Please contact the finance team.";
  }
  return null;
}

/** Finance user who approved KOKO/bank payment before fulfillment. */
export async function getApprovedOrderPaymentReviewerId(orderId: string): Promise<string | null> {
  const row = await prisma.approvalRequest.findFirst({
    where: {
      orderId,
      type: ORDER_PAYMENT_APPROVAL,
      status: "approved",
      reviewedById: { not: null },
    },
    orderBy: { reviewedAt: "desc" },
    select: { reviewedById: true },
  });
  return row?.reviewedById ?? null;
}

/** True when finance already approved this payment type once (e.g. after HOD revert re-approval). */
export async function hasPriorApprovedPaymentApproval(
  orderId: string,
  type: typeof ORDER_PAYMENT_APPROVAL | typeof DELIVERY_PAYMENT_APPROVAL,
  excludeApprovalId: string,
): Promise<boolean> {
  const prior = await prisma.approvalRequest.findFirst({
    where: {
      orderId,
      type,
      status: "approved",
      id: { not: excludeApprovalId },
    },
    select: { id: true },
  });
  return prior != null;
}

export async function createOrGetOrderPaymentApproval(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
  invoiceLabel: string;
  paymentType: string;
  amount: string;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${ORDER_PAYMENT_APPROVAL}
        AND "orderId" = ${input.orderId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  if (existing[0]) return existing[0];

  const id = randomUUID();
  const rowsAffected = await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id", "companyId", "type", "status", "orderId",
        "requestedById", "requestNote", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.companyId}, ${ORDER_PAYMENT_APPROVAL}, ${"pending"}, ${input.orderId},
        ${input.requestedById}, ${`${input.paymentType} — amount: ${input.amount}`},
        ${new Date()}, ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  // Concurrent insert won the race — return the existing pending approval
  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${ORDER_PAYMENT_APPROVAL}
          AND "orderId" = ${input.orderId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

  const financeUsers = await getFinanceApprovalUsers(input.companyId);

  await Promise.all(
    financeUsers.map((u) =>
      createNotification({
        companyId: input.companyId,
        userId: u.id,
        type: "approval_requested",
        title: "Finance approval required",
        body: `${input.paymentType} payment approval needed for ${input.invoiceLabel}.`,
        entityType: "ApprovalRequest",
        entityId: id,
      })
    )
  );

  const financeEmails = financeUsers.map((u) => u.email).filter((e): e is string => !!e);
  if (financeEmails.length > 0) {
    void sendFinanceApprovalEmail(financeEmails, input.invoiceLabel, input.paymentType, input.amount).catch(
      (err) => console.error("[Finance approval] Email send failed:", err)
    );
  }

  return { id, status: "pending" as ApprovalStatus };
}

export async function getPendingDeliveryPaymentApproval(orderId: string) {
  return prisma.approvalRequest.findFirst({
    where: { orderId, type: DELIVERY_PAYMENT_APPROVAL, status: "pending" },
    select: { id: true, status: true },
  });
}

export async function createOrGetDeliveryPaymentApproval(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
  invoiceLabel: string;
  paymentType: string;
  amount: string;
  collectionNote?: string | null;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${DELIVERY_PAYMENT_APPROVAL}
        AND "orderId" = ${input.orderId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  if (existing[0]) return existing[0];

  const requestNote = [
    `${input.paymentType} — amount: ${input.amount}`,
    input.collectionNote?.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const id = randomUUID();
  const rowsAffected = await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id", "companyId", "type", "status", "orderId",
        "requestedById", "requestNote", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.companyId}, ${DELIVERY_PAYMENT_APPROVAL}, ${"pending"}, ${input.orderId},
        ${input.requestedById}, ${requestNote},
        ${new Date()}, ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${DELIVERY_PAYMENT_APPROVAL}
          AND "orderId" = ${input.orderId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

  if (DELIVERY_PAYMENT_FINANCE_UI_ENABLED) {
    const financeUsers = await getFinanceApprovalUsers(input.companyId);
    await Promise.all(
      financeUsers.map((u) =>
        createNotification({
          companyId: input.companyId,
          userId: u.id,
          type: "approval_requested",
          title: "Delivery payment confirmation required",
          body: `Confirm payment received for ${input.invoiceLabel} (${input.paymentType}).`,
          entityType: "ApprovalRequest",
          entityId: id,
        })
      )
    );
  }

  return { id, status: "pending" as ApprovalStatus };
}

export async function createOrGetReturnRearrangeApproval(input: {
  companyId: string;
  orderId: string;
  orderReturnId: string;
  requestedById: string;
  requestNote?: string | null;
  invoiceLabel: string;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${RETURN_REARRANGE_PAYMENT_APPROVAL}
        AND "orderReturnId" = ${input.orderReturnId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );

  if (existing[0]) {
    return existing[0];
  }

  const id = randomUUID();
  const rowsAffected = await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id",
        "companyId",
        "type",
        "status",
        "orderId",
        "orderReturnId",
        "requestedById",
        "requestNote",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${input.companyId},
        ${RETURN_REARRANGE_PAYMENT_APPROVAL},
        ${"pending"},
        ${input.orderId},
        ${input.orderReturnId},
        ${input.requestedById},
        ${input.requestNote ?? null},
        ${new Date()},
        ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  // Concurrent insert won the race — return the existing pending approval
  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${RETURN_REARRANGE_PAYMENT_APPROVAL}
          AND "orderReturnId" = ${input.orderReturnId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

  const financeUserIds = await getFinanceApprovalUserIds(input.companyId);
  await Promise.all(
    financeUserIds.map((userId) =>
      createNotification({
        companyId: input.companyId,
        userId,
        type: "approval_requested",
        title: "Finance approval requested",
        body: `Bank transfer approval requested for ${input.invoiceLabel}.`,
        entityType: "ApprovalRequest",
        entityId: id,
      })
    )
  );

  return { id, status: "pending" as ApprovalStatus };
}

export type ReturnCancelApprovalNote = {
  invoiceLabel: string;
  shopifyOrderId: string | null;
  erpnextInvoiceId: string | null;
  returnRemark: string | null;
  cancelRemark: string;
  returnDate: string;
  cancelRequestedAt: string;
};

export function serializeReturnCancelApprovalNote(note: ReturnCancelApprovalNote) {
  return JSON.stringify(note);
}

export function parseReturnCancelApprovalNote(requestNote: string | null | undefined): ReturnCancelApprovalNote | null {
  if (!requestNote?.trim()) return null;
  try {
    const parsed = JSON.parse(requestNote) as ReturnCancelApprovalNote;
    if (!parsed || typeof parsed !== "object" || !parsed.cancelRemark) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createOrGetReturnCancelApproval(input: {
  companyId: string;
  orderId: string;
  orderReturnId: string;
  requestedById: string;
  requestNote: string;
  invoiceLabel: string;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${RETURN_CANCEL_APPROVAL}
        AND "orderReturnId" = ${input.orderReturnId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );

  if (existing[0]) {
    return existing[0];
  }

  const id = randomUUID();
  const rowsAffected = await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id",
        "companyId",
        "type",
        "status",
        "orderId",
        "orderReturnId",
        "requestedById",
        "requestNote",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id},
        ${input.companyId},
        ${RETURN_CANCEL_APPROVAL},
        ${"pending"},
        ${input.orderId},
        ${input.orderReturnId},
        ${input.requestedById},
        ${input.requestNote},
        ${new Date()},
        ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${RETURN_CANCEL_APPROVAL}
          AND "orderReturnId" = ${input.orderReturnId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

  const financeUserIds = await getFinanceApprovalUserIds(input.companyId);
  await Promise.all(
    financeUserIds.map((userId) =>
      createNotification({
        companyId: input.companyId,
        userId,
        type: "approval_requested",
        title: "Return cancel approval requested",
        body: `Process cancellation in ERPNext for ${input.invoiceLabel}. Open the linked Sales Invoice from Finance Approvals.`,
        entityType: "ApprovalRequest",
        entityId: id,
      })
    )
  );

  return { id, status: "pending" as ApprovalStatus };
}

export async function createInvoiceRevertVoidApproval(input: {
  companyId: string;
  orderId: string;
  invoiceLabel: string;
  revertedAt: Date;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${INVOICE_REVERT_VOID_APPROVAL}
        AND "orderId" = ${input.orderId}
        AND "status" = 'pending'
      LIMIT 1
    `
  );
  if (existing[0]) return existing[0];

  const id = randomUUID();
  const revertDateStr = input.revertedAt.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id", "companyId", "type", "status", "orderId",
        "requestedById", "requestNote", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.companyId}, ${INVOICE_REVERT_VOID_APPROVAL}, ${"pending"}, ${input.orderId},
        ${null}, ${`${input.invoiceLabel} — reverted from invoice complete on ${revertDateStr}`},
        ${new Date()}, ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  const financeUserIds = await getFinanceApprovalUserIds(input.companyId);
  await Promise.all(
    financeUserIds.map((userId) =>
      createNotification({
        companyId: input.companyId,
        userId,
        type: "approval_requested",
        title: "Reverted order returned to store",
        body: `Order ${input.invoiceLabel}, reverted on ${revertDateStr}, is now returned to store. Please approve to mark it as voided.`,
        entityType: "Order",
        entityId: input.orderId,
      })
    )
  );

  return { id, status: "pending" as ApprovalStatus };
}

export async function createPaymentMethodChangeApproval(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
  invoiceLabel: string;
  targetPaymentMethod: string;
  amount: string;
}) {
  const existing = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
    Prisma.sql`
      SELECT "id", "status"
      FROM "ApprovalRequest"
      WHERE "companyId" = ${input.companyId}
        AND "type" = ${PAYMENT_METHOD_CHANGE_APPROVAL}
        AND "orderId" = ${input.orderId}
        AND "status" = 'pending'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );
  if (existing[0]) return existing[0];

  const id = randomUUID();
  const rowsAffected = await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ApprovalRequest" (
        "id", "companyId", "type", "status", "orderId",
        "requestedById", "requestNote", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.companyId}, ${PAYMENT_METHOD_CHANGE_APPROVAL}, ${"pending"}, ${input.orderId},
        ${input.requestedById}, ${`${input.targetPaymentMethod} — payment method change request — amount: ${input.amount}`},
        ${new Date()}, ${new Date()}
      )
      ON CONFLICT DO NOTHING
    `
  );

  if (rowsAffected === 0) {
    const concurrent = await prisma.$queryRaw<Array<{ id: string; status: ApprovalStatus }>>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "ApprovalRequest"
        WHERE "companyId" = ${input.companyId}
          AND "type" = ${PAYMENT_METHOD_CHANGE_APPROVAL}
          AND "orderId" = ${input.orderId}
          AND "status" = 'pending'
        LIMIT 1
      `
    );
    return concurrent[0]!;
  }

  const financeUsers = await getFinanceApprovalUsers(input.companyId);

  await Promise.all(
    financeUsers.map((u) =>
      createNotification({
        companyId: input.companyId,
        userId: u.id,
        type: "approval_requested",
        title: "Payment method change approval required",
        body: `${input.targetPaymentMethod} payment method change requested for ${input.invoiceLabel} — amount: ${input.amount}.`,
        entityType: "ApprovalRequest",
        entityId: id,
      })
    )
  );

  const financeEmails = financeUsers.map((u) => u.email).filter((e): e is string => !!e);
  if (financeEmails.length > 0) {
    void sendFinanceApprovalEmail(financeEmails, input.invoiceLabel, input.targetPaymentMethod, input.amount).catch(
      (err) => console.error("[Finance approval] Email send failed:", err)
    );
  }

  return { id, status: "pending" as ApprovalStatus };
}

export async function notifyApprovalRequester(input: {
  companyId: string;
  approvalId: string;
  status: "approved" | "rejected";
  invoiceLabel: string;
  requestedById: string | null;
  approvalType?: string;
}) {
  if (!input.requestedById) return;
  const isReturnCancel = input.approvalType === RETURN_CANCEL_APPROVAL;
  const isReturnRearrange = input.approvalType === RETURN_REARRANGE_PAYMENT_APPROVAL;
  await createNotification({
    companyId: input.companyId,
    userId: input.requestedById,
    type: `approval_${input.status}`,
    title: input.status === "approved" ? "Finance approval granted" : "Finance approval rejected",
    body:
      input.status === "approved"
        ? isReturnCancel
          ? `${input.invoiceLabel} cancel request marked processed. Cancellation is completed in ERPNext.`
          : isReturnRearrange
            ? `${input.invoiceLabel} is approved for rearrange dispatch.`
            : `${input.invoiceLabel} finance approval was granted.`
        : isReturnCancel
          ? `${input.invoiceLabel} cancel request was rejected.`
          : `${input.invoiceLabel} finance approval was rejected.`,
    entityType: "ApprovalRequest",
    entityId: input.approvalId,
  });
}
