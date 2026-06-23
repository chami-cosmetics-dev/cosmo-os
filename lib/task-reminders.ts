import type { Prisma } from "@prisma/client";

import {
  DELIVERY_PAYMENT_APPROVAL,
  DELIVERY_PAYMENT_FINANCE_UI_ENABLED,
  FINANCE_APPROVAL_TYPES,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { resolveOrderStageEnteredAt, waitingHoursSince } from "@/lib/order-stage-timing";
import { prisma } from "@/lib/prisma";

export const TASK_REMINDER_SLA_MS = 24 * 60 * 60 * 1000;
const REMINDER_LIMIT_PER_CATEGORY = 20;

export type TaskReminderCategory =
  | "finance_approval"
  | "add_samples"
  | "print"
  | "rearrange_dispatch"
  | "ready_dispatch"
  | "return_action"
  | "delivery_pending";

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
};

type PermissionContext = {
  permissionKeys: string[];
  roleNames: string[];
};

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
): Promise<TaskReminder[]> {
  const approvalTypes = DELIVERY_PAYMENT_FINANCE_UI_ENABLED
    ? [...FINANCE_APPROVAL_TYPES]
    : FINANCE_APPROVAL_TYPES.filter((type) => type !== DELIVERY_PAYMENT_APPROVAL);

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      companyId,
      status: "pending",
      type: { in: approvalTypes },
      createdAt: { lte: slaCutoff(now) },
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
      href: "/dashboard/approvals",
      waitingHours,
      orderId: order?.id,
      invoiceLabel,
    };
  });
}

async function fetchSampleReminders(companyId: string, now: Date): Promise<TaskReminder[]> {
  const tomorrow = startOfTomorrowUtc();
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      ...baseFulfillmentOrderWhere,
      sourceName: { in: ["web", "manual"] },
      fulfillmentStage: { in: ["order_received", "sample_free_issue"] },
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
        href: "/dashboard/fulfillment/sample-free-issue",
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
      ...baseFulfillmentOrderWhere,
      printCount: 0,
      totalPrice: { gte: 0 },
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
        href: "/dashboard/fulfillment/print",
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
  const href = "/dashboard/fulfillment/dispatch";
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
        href,
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
      href: "/dashboard/returns",
      waitingHours,
      orderId: item.order.id,
      invoiceLabel,
    };
  });
}

async function fetchDeliveryPendingReminders(companyId: string, now: Date): Promise<TaskReminder[]> {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      financialStatus: { not: "voided" },
      fulfillmentStage: "dispatched",
      deliveryCompleteAt: null,
      dispatchedAt: { not: null, lte: slaCutoff(now) },
    },
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

  return orders.map((order) => {
    const since = order.dispatchedAt!;
    const invoiceLabel = orderInvoiceLabel(order);
    const waitingHours = waitingHoursSince(since, now);
    return {
      id: `delivery_pending:${order.id}`,
      category: "delivery_pending" as const,
      title: "Delivery not completed",
      body: `${invoiceLabel} was dispatched ${waitingHours}h ago and delivery is not marked complete.`,
      href: "/dashboard/fulfillment/delivery-invoice",
      waitingHours,
      orderId: order.id,
      invoiceLabel,
    };
  });
}

export async function fetchTaskReminders(
  companyId: string,
  context: PermissionContext,
  now: Date = new Date(),
): Promise<TaskRemindersResult> {
  // Run sequentially — Neon pooler often has connection_limit=1; parallel queries exhaust the pool.
  const reminders: TaskReminder[] = [];

  if (hasReminderPermission(context, "finance.approvals.manage")) {
    reminders.push(...(await fetchFinanceApprovalReminders(companyId, now)));
  }
  if (hasReminderPermission(context, "fulfillment.sample_free_issue.read")) {
    reminders.push(...(await fetchSampleReminders(companyId, now)));
  }
  if (hasReminderPermission(context, "fulfillment.order_print.read")) {
    reminders.push(...(await fetchPrintReminders(companyId, now)));
  }
  if (hasReminderPermission(context, "fulfillment.ready_dispatch.read")) {
    reminders.push(...(await fetchDispatchReminders(companyId, now, false)));
    reminders.push(...(await fetchDispatchReminders(companyId, now, true)));
  }
  if (hasReminderPermission(context, "returns.read")) {
    reminders.push(...(await fetchReturnActionReminders(companyId, now)));
  }
  if (hasReminderPermission(context, "fulfillment.delivery_invoice.read")) {
    reminders.push(...(await fetchDeliveryPendingReminders(companyId, now)));
  }

  reminders.sort((a, b) => b.waitingHours - a.waitingHours);

  return {
    reminders,
    totalCount: reminders.length,
  };
}
