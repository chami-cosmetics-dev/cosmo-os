import type { Prisma } from "@prisma/client";

/** Stages where fulfillment work is finished — never show in active queues/reminders. */
export const TERMINAL_FULFILLMENT_STAGES = [
  "returned",
  "returned_to_store",
  "delivery_complete",
  "invoice_complete",
] as const;

/** Exclude orders already fulfilled or past the active pipeline. */
export const activeFulfillmentPipelineWhere = {
  fulfillmentStatus: { not: "fulfilled" },
  fulfillmentStage: { notIn: [...TERMINAL_FULFILLMENT_STAGES] },
} satisfies Prisma.OrderWhereInput;

/** Sample / free-issue queue — still waiting for merchant samples. */
export const sampleQueueWhere = {
  ...activeFulfillmentPipelineWhere,
  sampleFreeIssueCompleteAt: null,
  dispatchedAt: null,
  deliveryCompleteAt: null,
  invoiceCompleteAt: null,
} satisfies Prisma.OrderWhereInput;
