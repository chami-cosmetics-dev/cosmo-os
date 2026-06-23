import type { Prisma } from "@prisma/client";

/** Exclude orders blocked because ERP sync failed with out-of-stock. */
export const excludeErpOutOfStockBlockedOrdersWhere = {
  NOT: {
    OR: [
      { erpnextSyncError: { contains: "NegativeStockError", mode: "insensitive" } },
      { erpnextSyncError: { contains: "Out of stock -", mode: "insensitive" } },
    ],
  },
} satisfies Prisma.OrderWhereInput;

/** Stages where fulfillment work is finished — never show in active queues/reminders. */
export const TERMINAL_FULFILLMENT_STAGES = [
  "returned",
  "returned_to_store",
  "delivery_complete",
  "invoice_complete",
] as const;

/** Exclude orders already fulfilled or past the active pipeline (Vault stages only). */
export const activeFulfillmentStageWhere = {
  fulfillmentStage: { notIn: [...TERMINAL_FULFILLMENT_STAGES] },
} satisfies Prisma.OrderWhereInput;

/** Sample / reminder queues — also hide Shopify-marked fulfilled orders still in early stages. */
export const activeFulfillmentPipelineWhere = {
  ...activeFulfillmentStageWhere,
  fulfillmentStatus: { not: "fulfilled" },
} satisfies Prisma.OrderWhereInput;

/** Active fulfillment queues — also block ERP out-of-stock sync failures. */
export const fulfillableOrderPipelineWhere = {
  ...activeFulfillmentPipelineWhere,
  ...excludeErpOutOfStockBlockedOrdersWhere,
} satisfies Prisma.OrderWhereInput;

/**
 * Dispatch pipeline — do not filter on Shopify fulfillmentStatus; an order can be
 * marked fulfilled in Shopify while Vault is still at print / dispatch.
 */
export const dispatchPipelineWhere = {
  ...activeFulfillmentStageWhere,
  ...excludeErpOutOfStockBlockedOrdersWhere,
} satisfies Prisma.OrderWhereInput;

/**
 * Delivery / invoice pipeline — do not filter on Shopify fulfillmentStatus or Vault
 * terminal stages; the explicit fulfillmentStage filter selects dispatched and later.
 */
export const deliveryPipelineWhere = {
  ...excludeErpOutOfStockBlockedOrdersWhere,
} satisfies Prisma.OrderWhereInput;

export function isDispatchFulfillmentStages(stages: string[]): boolean {
  return (
    stages.includes("ready_to_dispatch") &&
    stages.includes("print") &&
    !stages.includes("order_received") &&
    !stages.includes("sample_free_issue")
  );
}

export function isDeliveryFulfillmentStages(stages: string[]): boolean {
  return (
    stages.includes("dispatched") &&
    (stages.includes("delivery_complete") || stages.includes("invoice_complete")) &&
    !stages.includes("print") &&
    !stages.includes("ready_to_dispatch") &&
    !stages.includes("order_received") &&
    !stages.includes("sample_free_issue")
  );
}

/** Dispatch stage OR — matches historical dispatch queue rules. */
export const dispatchStageOrWhere = {
  OR: [
    {
      sourceName: { in: ["web", "manual"] },
      fulfillmentStage: { in: ["print", "ready_to_dispatch"] },
    },
    {
      sourceName: "erpnext",
      fulfillmentStage: { in: ["order_received", "print", "ready_to_dispatch"] },
    },
  ],
} satisfies Prisma.OrderWhereInput;

/** @deprecated Use dispatchStageOrWhere + dispatchPipelineWhere in page-data. */
export const dispatchQueueWhere = {
  ...dispatchPipelineWhere,
  ...dispatchStageOrWhere,
} satisfies Prisma.OrderWhereInput;

/** Sample / free-issue queue — still waiting for merchant samples. */
export const sampleQueueWhere = {
  ...fulfillableOrderPipelineWhere,
  sampleFreeIssueCompleteAt: null,
  dispatchedAt: null,
  deliveryCompleteAt: null,
  invoiceCompleteAt: null,
} satisfies Prisma.OrderWhereInput;
