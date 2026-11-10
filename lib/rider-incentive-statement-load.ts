import "server-only";

import { Prisma } from "@prisma/client";

import { formatAppIsoDate, formatAppIsoDateTime } from "@/lib/format-datetime";
import { formatAddress, getCustomerName } from "@/lib/reports/csv";
import {
  describeRiderPay,
  extractOrderShippingCity,
  isPickupShippingLabel,
  normalizeShippingRuleLabelKey,
  resolveOrderShippingRuleLabel,
} from "@/lib/rider-delivery-charge";
import {
  incentiveMatchForOrder,
  loadRiderIncentiveContext,
  type RiderIncentiveContext,
} from "@/lib/rider-incentive-resolve";
import {
  isIncentiveEligibleOrder,
  isRiderIncentiveUnlocked,
} from "@/lib/rider-incentive";
import {
  groupIncentiveStatement,
  type IncentiveStatementInput,
} from "@/lib/rider-incentive-statement";
import { prisma } from "@/lib/prisma";

const statementTaskSelect = {
  riderId: true,
  completedAt: true,
  manualIncentiveLabelKey: true,
  manualIncentiveAmount: true,
  rider: { select: { name: true, knownName: true } },
  order: {
    select: {
      shopifyOrderId: true,
      orderNumber: true,
      name: true,
      erpnextInvoiceId: true,
      customerPhone: true,
      financialStatus: true,
      fulfillmentStage: true,
      invoiceCompleteAt: true,
      totalShipping: true,
      shippingLines: true,
      shippingAddress: true,
      rawPayload: true,
      sourceName: true,
      discountCodes: true,
      companyLocation: { select: { name: true, erpnextCompany: true } },
    },
  },
} satisfies Prisma.RiderDeliveryTaskSelect;

type StatementTask = Prisma.RiderDeliveryTaskGetPayload<{ select: typeof statementTaskSelect }>;

function riderLabel(rider: { name: string | null; knownName: string | null }) {
  return rider.knownName || rider.name || "Rider";
}

function statementInputFromTask(
  task: StatementTask,
  incentiveContext: RiderIncentiveContext,
  districtLabelByKey: Map<string, string>,
): IncentiveStatementInput {
  const shippingRuleLabel = resolveOrderShippingRuleLabel(task.order);
  const match = incentiveMatchForOrder(
    task.order,
    incentiveContext.chargeByLabelKey,
    incentiveContext.zoneMembersByZone,
    task.manualIncentiveLabelKey,
    task.manualIncentiveAmount,
  );
  const unlocked = isRiderIncentiveUnlocked(task.order);
  const eligible = isIncentiveEligibleOrder(task.order.financialStatus);
  const unmatched =
    unlocked &&
    eligible &&
    !match.matched &&
    !match.excludedFromIncentive &&
    !task.manualIncentiveLabelKey;
  const payable =
    eligible && unlocked && !match.excludedFromIncentive ? match.amount : new Prisma.Decimal(0);
  const districtLabel = match.labelKey
    ? districtLabelByKey.get(normalizeShippingRuleLabelKey(match.labelKey)) ?? null
    : null;
  return {
    date: formatAppIsoDate(task.completedAt),
    shopifyOrderId: task.order.shopifyOrderId?.trim() || "",
    shopifyOrderNumber: task.order.name?.trim() || task.order.orderNumber?.trim() || "",
    invoiceNumber: task.order.erpnextInvoiceId?.trim() || "",
    customerName: getCustomerName(task.order.shippingAddress),
    phone: task.order.customerPhone?.trim() || "",
    address: formatAddress(task.order.shippingAddress),
    deliveryCity: extractOrderShippingCity(task.order) ?? "",
    deliveryCompletedAt: formatAppIsoDateTime(task.completedAt),
    invoiceCompletedAt: unlocked ? formatAppIsoDateTime(task.order.invoiceCompleteAt) : "",
    company:
      task.order.companyLocation.erpnextCompany?.trim() ||
      task.order.companyLocation.name.trim() ||
      "Unknown",
    deliveryStatus: "Complete",
    invoiceStatus: unlocked ? "Complete" : "Open",
    shippingCost: task.order.totalShipping?.toString() ?? "0",
    riderPayment: payable,
    unmatched,
    pickup: isPickupShippingLabel(shippingRuleLabel),
    orderShipping: shippingRuleLabel?.trim() || "",
    payMethod: describeRiderPay({
      shippingRuleLabel,
      labelKey: match.labelKey,
      matched: match.matched,
      manualOverride: match.manualOverride,
      districtLabel,
    }),
  };
}

async function loadCompletedStatementTasks(input: {
  companyId: string;
  from: Date;
  to: Date;
  riderId?: string;
}) {
  const [tasks, incentiveContext, chargeRules] = await Promise.all([
    prisma.riderDeliveryTask.findMany({
      where: {
        ...(input.riderId ? { riderId: input.riderId } : {}),
        status: "completed",
        // Month is the delivery-complete day. An earlier invoice close (KOKO, card, bank) does not move the pay.
        completedAt: { gte: input.from, lte: input.to },
        order: { companyId: input.companyId },
      },
      select: statementTaskSelect,
    }),
    loadRiderIncentiveContext(),
    prisma.riderDeliveryChargeRule.findMany({ select: { labelKey: true, label: true } }),
  ]);
  const districtLabelByKey = new Map(
    chargeRules.map((rule) => [
      normalizeShippingRuleLabelKey(rule.labelKey),
      rule.label.trim() || rule.labelKey,
    ]),
  );
  return { tasks, incentiveContext, districtLabelByKey };
}

export async function loadRiderIncentiveStatement(input: {
  companyId: string;
  riderId: string;
  from: Date;
  to: Date;
}) {
  const { tasks, incentiveContext, districtLabelByKey } = await loadCompletedStatementTasks(input);
  const riderName = tasks[0] ? riderLabel(tasks[0].rider) : "Rider";
  const rows = tasks.map((task) => statementInputFromTask(task, incentiveContext, districtLabelByKey));
  const grouped = groupIncentiveStatement(rows);
  return { riderName, ...grouped };
}

export async function loadAllRiderIncentiveStatements(input: {
  companyId: string;
  from: Date;
  to: Date;
}) {
  const { tasks, incentiveContext, districtLabelByKey } = await loadCompletedStatementTasks(input);
  const byRider = new Map<string, { riderName: string; rows: IncentiveStatementInput[] }>();
  for (const task of tasks) {
    const bucket = byRider.get(task.riderId) ?? { riderName: riderLabel(task.rider), rows: [] };
    bucket.rows.push(statementInputFromTask(task, incentiveContext, districtLabelByKey));
    byRider.set(task.riderId, bucket);
  }

  return [...byRider.entries()]
    .map(([riderId, bucket]) => ({
      riderId,
      riderName: bucket.riderName,
      ...groupIncentiveStatement(bucket.rows),
    }))
    .sort((a, b) => a.riderName.localeCompare(b.riderName) || a.riderId.localeCompare(b.riderId));
}
