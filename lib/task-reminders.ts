import { Prisma } from "@prisma/client";

import {
  DELIVERY_PAYMENT_APPROVAL,
  DELIVERY_PAYMENT_FINANCE_UI_ENABLED,
  FINANCE_APPROVAL_TYPES,
  ORDER_PAYMENT_APPROVAL,
  resolveViewerFinanceLocationIds,
} from "@/lib/approval-workflow";
import {
  deliveryPipelineWhere,
  fulfillableOrderPipelineWhere,
  printFulfillmentPipelineWhere,
  sampleQueueWhere,
} from "@/lib/fulfillment-queue-filters";
import { resolveOrderStageEnteredAt, waitingHoursSince } from "@/lib/order-stage-timing";
import { prisma } from "@/lib/prisma";
import {
  canSeeTaskReminderCategory,
  listVisibleTaskReminderCategories,
  shouldScopeSampleRemindersToMerchant,
  type TaskReminderAccessContext,
} from "@/lib/task-reminder-access";
import { taskReminderHref } from "@/lib/task-reminder-links";
import { TASK_REMINDER_SLA_MS } from "@/lib/task-reminder-sla";

export { TASK_REMINDER_SLA_HOURS, TASK_REMINDER_SLA_MS } from "@/lib/task-reminder-sla";
const REMINDER_LIMIT_PER_CATEGORY = 20;

export type TaskReminderCategory =
  | "erp_sync_warning"
  | "finance_approval"
  | "add_samples"
  | "print"
  | "rearrange_dispatch"
  | "ready_dispatch"
  | "return_action"
  | "delivery_pending"
  | "invoice_complete";

export type TaskReminder = {
  id: string;
  category: TaskReminderCategory;
  title: string;
  body: string;
  href: string;
  waitingHours: number;
  orderId?: string;
  invoiceLabel: string;
};

export type TaskRemindersResult = {
  reminders: TaskReminder[];
  totalCount: number;
  /** Full match counts per category (list may be capped, e.g. delivery_pending shows 20). */
  categoryCounts: Partial<Record<TaskReminderCategory, number>>;
  /** Categories this user may monitor (shown in HUD even when count is 0). */
  visibleCategories: TaskReminderCategory[];
};

type PermissionContext = TaskReminderAccessContext;

function startOfTomorrowUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
}

export function hasReminderPermission(
  context: PermissionContext,
  permission: string,
): boolean {
  const { permissionKeys, roleNames } = context;
  return (
    roleNames.includes("super_admin") ||
    roleNames.includes("admin") ||
    permissionKeys.includes(permission)
  );
}

export function isTaskReminderOverdue(since: Date | null | undefined, now: Date = new Date()): boolean {
  if (!since) return false;
  return now.getTime() - since.getTime() >= TASK_REMINDER_SLA_MS;
}

export function slaCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - TASK_REMINDER_SLA_MS);
}

function orderInvoiceLabel(order: {
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string | null;
  id: string;
}) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId ?? order.id;
}

const baseFulfillmentOrderWhere = {
  ...fulfillableOrderPipelineWhere,
  financialStatus: { not: "voided" },
  packageOnHoldAt: null,
  companyLocation: { fulfillmentBlocked: false },
  NOT: {
    approvalRequests: {
      some: { type: ORDER_PAYMENT_APPROVAL, status: "pending" },
    },
  },
} satisfies Prisma.OrderWhereInput;

function compactReminders(items: Array<TaskReminder | null>): TaskReminder[] {
  return items.filter((item): item is TaskReminder => item !== null);
}

function sortAndCap(reminders: TaskReminder[]): TaskReminder[] {
  return reminders
    .sort((a, b) => b.waitingHours - a.waitingHours)
    .slice(0, REMINDER_LIMIT_PER_CATEGORY);
}

async function fetchFinanceApprovalReminders(
  companyId: string,
  now: Date,
  financeLocationIds: string[] | null,
): Promise<TaskReminder[]> {
  if (financeLocationIds !== null && financeLocationIds.length === 0) {
    return [];
  }

  const approvalTypes = DELIVERY_PAYMENT_FINANCE_UI_ENABLED
    ? [...FINANCE_APPROVAL_TYPES]
    : FINANCE_APPROVAL_TYPES.filter((type) => type !== DELIVERY_PAYMENT_APPROVAL);

  const locationScope: Prisma.ApprovalRequestWhereInput | undefined =
    financeLocationIds === null
      ? undefined
      : {
          OR: [
            { order: { companyLocationId: { in: financeLocationIds } } },
            {
              orderReturn: {
                order: { companyLocationId: { in: financeLocationIds } },
              },
            },
          ],
        };

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      companyId,
      status: "pending",
      type: { in: approvalTypes },
      createdAt: { lte: slaCutoff(now) },
      ...(locationScope ?? {}),
      NOT: {
        OR: [
          { order: { financialStatus: { equals: "voided", mode: "insensitive" } } },
          {
            orderReturn: {
              order: { financialStatus: { equals: "voided", mode: "insensitive" } },
            },
          },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: REMINDER_LIMIT_PER_CATEGORY,
    select: {
      id: true,
      type: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
        },
      },
      orderReturn: {
        select: {
          order: {
            select: {
              id: true,
              name: true,
              orderNumber: true,
              shopifyOrderId: true,
            },
          },
        },
      },
    },
  });

  return approvals.map((approval) => {
    const order = approval.order ?? approval.orderReturn?.order;
    const invoiceLabel = order ? orderInvoiceLabel(order) : approval.id;
    const waitingHours = waitingHoursSince(approval.createdAt, now);
    return {
      id: `finance_approval:${approval.id}`,
      category: "finance_approval" as const,
      title: "Finance approval overdue",
      body: `${invoiceLabel} has been waiting for your approval. Don't keep the customer waiting.`,
      href: taskReminderHref("/dashboard/approvals", { orderId: order?.id }),
      waitingHours,
      orderId: order?.id,
      invoiceLabel,
    };
  });
}

async function fetchSampleReminders(
  companyId: string,
  now: Date,
  context: PermissionContext,
): Promise<TaskReminder[]> {
  const tomorrow = startOfTomorrowUtc();
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      financialStatus: { not: "voided" },
      packageOnHoldAt: null,
      companyLocation: { fulfillmentBlocked: false },
      sourceName: { in: ["web", "manual"] },
      fulfillmentStage: { in: ["order_received", "sample_free_issue"] },
      ...(shouldScopeSampleRemindersToMerchant(context) && context.userId
        ? { assignedMerchantId: context.userId }
        : {}),
      AND: [
        sampleQueueWhere,
        {
          NOT: {
            approvalRequests: {
              some: { type: ORDER_PAYMENT_APPROVAL, status: "pending" },
            },
          },
        },
      ],
      OR: [
        { sampleFreeIssueSendLaterDate: null },
        { sampleFreeIssueSendLaterDate: { lt: tomorrow } },
      ],
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      fulfillmentStage: true,
      fulfillmentStageEnteredAt: true,
      createdAt: true,
      updatedAt: true,
      sampleFreeIssueCompleteAt: true,
      packageReadyAt: true,
      dispatchedAt: true,
      deliveryCompleteAt: true,
      invoiceCompleteAt: true,
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });

  const reminders = compactReminders(
    orders.map((order) => {
      const since = resolveOrderStageEnteredAt(order);
      if (!isTaskReminderOverdue(since, now)) return null;
      const invoiceLabel = orderInvoiceLabel(order);
      const waitingHours = waitingHoursSince(since, now);
      return {
        id: `add_samples:${order.id}`,
        category: "add_samples" as const,
        title: "Samples needed",
        body: `${invoiceLabel} is waiting for samples (${waitingHours}h). Add samples so fulfillment can continue.`,
        href: taskReminderHref("/dashboard/fulfillment/sample-free-issue", { orderId: order.id }),
        waitingHours,
        orderId: order.id,
        invoiceLabel,
      };
    }),
  );

  return sortAndCap(reminders);
}

async function fetchPrintReminders(companyId: string, now: Date): Promise<TaskReminder[]> {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      financialStatus: { not: "voided" },
      packageOnHoldAt: null,
      companyLocation: { fulfillmentBlocked: false },
      printCount: 0,
      totalPrice: { gte: 0 },
      AND: [
        printFulfillmentPipelineWhere,
        {
          NOT: {
            approvalRequests: {
              some: { type: ORDER_PAYMENT_APPROVAL, status: "pending" },
            },
          },
        },
      ],
      OR: [
        { sourceName: { in: ["web", "manual"] }, fulfillmentStage: "print" },
        {
          sourceName: "erpnext",
          fulfillmentStage: { in: ["order_received", "ready_to_dispatch", "print"] },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      fulfillmentStage: true,
      fulfillmentStageEnteredAt: true,
      createdAt: true,
      updatedAt: true,
      sampleFreeIssueCompleteAt: true,
      packageReadyAt: true,
      dispatchedAt: true,
      deliveryCompleteAt: true,
      invoiceCompleteAt: true,
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });

  const reminders = compactReminders(
    orders.map((order) => {
      const since = resolveOrderStageEnteredAt(order);
      if (!isTaskReminderOverdue(since, now)) return null;
      const invoiceLabel = orderInvoiceLabel(order);
      const waitingHours = waitingHoursSince(since, now);
      return {
        id: `print:${order.id}`,
        category: "print" as const,
        title: "Waiting to print",
        body: `${invoiceLabel} has been waiting to print for ${waitingHours}h.`,
        href: taskReminderHref("/dashboard/fulfillment/print", { orderId: order.id }),
        waitingHours,
        orderId: order.id,
        invoiceLabel,
      };
    }),
  );

  return sortAndCap(reminders);
}

async function fetchDispatchReminders(
  companyId: string,
  now: Date,
  rearrange: boolean,
): Promise<TaskReminder[]> {
  const category: TaskReminderCategory = rearrange ? "rearrange_dispatch" : "ready_dispatch";
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      ...baseFulfillmentOrderWhere,
      fulfillmentStage: "ready_to_dispatch",
      packageReadyAt: { not: null },
      totalPrice: { gte: 0 },
      returns: rearrange ? { some: { actionType: "rearrange" } } : { none: {} },
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      packageReadyAt: true,
    },
    take: 100,
    orderBy: { packageReadyAt: "asc" },
  });

  const reminders = compactReminders(
    orders.map((order) => {
      const since = order.packageReadyAt;
      if (!isTaskReminderOverdue(since, now)) return null;
      const invoiceLabel = orderInvoiceLabel(order);
      const waitingHours = waitingHoursSince(since!, now);
      return {
        id: `${category}:${order.id}`,
        category,
        title: rearrange ? "Rearrange dispatch overdue" : "Ready to dispatch overdue",
        body: rearrange
          ? `${invoiceLabel} rearrange has been waiting for dispatch (${waitingHours}h). Don't keep the customer waiting.`
          : `${invoiceLabel} is ready to dispatch and has been waiting ${waitingHours}h.`,
        href: taskReminderHref("/dashboard/fulfillment/dispatch", {
          orderId: order.id,
          queue: rearrange ? "rearrange" : undefined,
        }),
        waitingHours,
        orderId: order.id,
        invoiceLabel,
      };
    }),
  );

  return sortAndCap(reminders);
}

async function fetchReturnActionReminders(companyId: string, now: Date): Promise<TaskReminder[]> {
  const returns = await prisma.orderReturn.findMany({
    where: {
      companyId,
      actionStatus: "pending",
      returnDate: { lte: slaCutoff(now) },
    },
    orderBy: { returnDate: "asc" },
    take: REMINDER_LIMIT_PER_CATEGORY,
    select: {
      id: true,
      returnDate: true,
      order: {
        select: {
          id: true,
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
        },
      },
    },
  });

  return returns.map((item) => {
    const invoiceLabel = orderInvoiceLabel(item.order);
    const waitingHours = waitingHoursSince(item.returnDate, now);
    return {
      id: `return_action:${item.id}`,
      category: "return_action" as const,
      title: "Return needs action",
      body: `${invoiceLabel} return has been waiting for action (${waitingHours}h). Rearrange or resolve it.`,
      href: taskReminderHref("/dashboard/returns", { orderId: item.order.id }),
      waitingHours,
      orderId: item.order.id,
      invoiceLabel,
    };
  });
}

async function fetchErpSyncWarnings(companyId: string, userId: string, now: Date): Promise<TaskReminder[]> {
  const alerts = await prisma.$queryRaw<
    Array<{ id: string; title: string; body: string | null; createdAt: Date }>
  >(
    Prisma.sql`
      SELECT "id", "title", "body", "createdAt"
      FROM "Notification"
      WHERE "companyId" = ${companyId}
        AND "userId" = ${userId}
        AND "type" = 'erp_sync_failure'
        AND "readAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 10
    `
  );

  return alerts.map((alert) => ({
    id: `erp_sync_warning:${alert.id}`,
    category: "erp_sync_warning" as const,
    title: alert.title,
    body: alert.body ?? "ERP sync failed. Dismiss when reviewed.",
    href: "/dashboard",
    waitingHours: waitingHoursSince(alert.createdAt, now),
    invoiceLabel: "ERP sync",
  }));
}

async function fetchDeliveryPendingReminders(
  companyId: string,
  now: Date,
): Promise<{ reminders: TaskReminder[]; totalCount: number }> {
  const where: Prisma.OrderWhereInput = {
    companyId,
    ...deliveryPipelineWhere,
    financialStatus: { not: "voided" },
    fulfillmentStage: "dispatched",
    deliveryCompleteAt: null,
    dispatchedAt: { not: null, lte: slaCutoff(now) },
  };

  const totalCount = await prisma.order.count({ where });
  const orders = await prisma.order.findMany({
    where,
    // Most overdue first (oldest dispatch); list capped — badge uses totalCount.
    orderBy: { dispatchedAt: "asc" },
    take: REMINDER_LIMIT_PER_CATEGORY,
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      dispatchedAt: true,
    },
  });

  const reminders = orders.map((order) => {
    const since = order.dispatchedAt!;
    const invoiceLabel = orderInvoiceLabel(order);
    const waitingHours = waitingHoursSince(since, now);
    return {
      id: `delivery_pending:${order.id}`,
      category: "delivery_pending" as const,
      title: "Delivery not completed",
      body: `${invoiceLabel} was dispatched ${waitingHours}h ago and delivery is not marked complete.`,
      href: taskReminderHref("/dashboard/fulfillment/delivery-invoice", { orderId: order.id }),
      waitingHours,
      orderId: order.id,
      invoiceLabel,
    };
  });

  return { reminders, totalCount };
}

async function fetchInvoiceCompleteReminders(
  companyId: string,
  now: Date,
  financeLocationIds: string[] | null,
): Promise<{ reminders: TaskReminder[]; totalCount: number }> {
  if (financeLocationIds !== null && financeLocationIds.length === 0) {
    return { reminders: [], totalCount: 0 };
  }

  const where: Prisma.OrderWhereInput = {
    companyId,
    ...deliveryPipelineWhere,
    financialStatus: { not: "voided" },
    fulfillmentStage: "delivery_complete",
    invoiceCompleteAt: null,
    deliveryCompleteAt: { not: null, lte: slaCutoff(now) },
    ...(financeLocationIds !== null
      ? { companyLocationId: { in: financeLocationIds } }
      : {}),
  };

  const totalCount = await prisma.order.count({ where });
  const orders = await prisma.order.findMany({
    where,
    // Most overdue first (oldest delivery); list capped — badge uses totalCount.
    orderBy: { deliveryCompleteAt: "asc" },
    take: REMINDER_LIMIT_PER_CATEGORY,
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      deliveryCompleteAt: true,
    },
  });

  const reminders = orders.map((order) => {
    const since = order.deliveryCompleteAt!;
    const invoiceLabel = orderInvoiceLabel(order);
    const waitingHours = waitingHoursSince(since, now);
    return {
      id: `invoice_complete:${order.id}`,
      category: "invoice_complete" as const,
      title: "Invoice not completed",
      body: `${invoiceLabel} was delivered ${waitingHours}h ago and invoice is not marked complete.`,
      href: taskReminderHref("/dashboard/fulfillment/invoice-complete", { orderId: order.id }),
      waitingHours,
      orderId: order.id,
      invoiceLabel,
    };
  });

  return { reminders, totalCount };
}

export async function fetchTaskReminders(
  companyId: string,
  context: PermissionContext,
  now: Date = new Date(),
): Promise<TaskRemindersResult> {
  // Run sequentially — Neon pooler often has connection_limit=1; parallel queries exhaust the pool.
  const reminders: TaskReminder[] = [];
  const categoryCounts: Partial<Record<TaskReminderCategory, number>> = {};

  if (canSeeTaskReminderCategory(context, "erp_sync_warning") && context.userId) {
    reminders.push(...(await fetchErpSyncWarnings(companyId, context.userId, now)));
  }

  const needsFinanceLocationScope =
    canSeeTaskReminderCategory(context, "finance_approval") ||
    canSeeTaskReminderCategory(context, "invoice_complete");
  const financeLocationIds =
    needsFinanceLocationScope && context.userId
      ? await resolveViewerFinanceLocationIds(context.userId, companyId, context.roleNames)
      : null;

  if (canSeeTaskReminderCategory(context, "finance_approval")) {
    reminders.push(
      ...(await fetchFinanceApprovalReminders(companyId, now, financeLocationIds)),
    );
  }
  if (canSeeTaskReminderCategory(context, "add_samples")) {
    reminders.push(...(await fetchSampleReminders(companyId, now, context)));
  }
  if (canSeeTaskReminderCategory(context, "print")) {
    reminders.push(...(await fetchPrintReminders(companyId, now)));
  }
  if (canSeeTaskReminderCategory(context, "ready_dispatch")) {
    reminders.push(...(await fetchDispatchReminders(companyId, now, false)));
  }
  if (canSeeTaskReminderCategory(context, "rearrange_dispatch")) {
    reminders.push(...(await fetchDispatchReminders(companyId, now, true)));
  }
  if (canSeeTaskReminderCategory(context, "return_action")) {
    reminders.push(...(await fetchReturnActionReminders(companyId, now)));
  }
  if (canSeeTaskReminderCategory(context, "delivery_pending")) {
    const deliveryPending = await fetchDeliveryPendingReminders(companyId, now);
    reminders.push(...deliveryPending.reminders);
    categoryCounts.delivery_pending = deliveryPending.totalCount;
  }
  if (canSeeTaskReminderCategory(context, "invoice_complete")) {
    const invoiceComplete = await fetchInvoiceCompleteReminders(
      companyId,
      now,
      financeLocationIds,
    );
    reminders.push(...invoiceComplete.reminders);
    categoryCounts.invoice_complete = invoiceComplete.totalCount;
  }

  reminders.sort((a, b) => b.waitingHours - a.waitingHours);

  const cappedCountCategories = new Set<TaskReminderCategory>([
    "delivery_pending",
    "invoice_complete",
  ]);

  for (const reminder of reminders) {
    if (cappedCountCategories.has(reminder.category)) continue;
    categoryCounts[reminder.category] = (categoryCounts[reminder.category] ?? 0) + 1;
  }

  const visibleCategories = listVisibleTaskReminderCategories(context);
  const totalCount = Object.values(categoryCounts).reduce((sum, n) => sum + (n ?? 0), 0);

  return {
    reminders,
    totalCount,
    categoryCounts,
    visibleCategories,
  };
}
