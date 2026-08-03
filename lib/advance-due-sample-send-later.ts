import { getFinancePaymentApprovalBlockReason } from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { prisma } from "@/lib/prisma";

/**
 * Start of tomorrow as a UTC-midnight date-only instant, using Asia/Colombo's
 * calendar day. Matches how `sampleFreeIssueSendLaterDate` is stored (UTC midnight YMD).
 *
 * Example: at 2026-07-07 00:01 Colombo, returns 2026-07-08T00:00:00.000Z so
 * send-later dates of 2026-07-07 (and earlier) are due.
 */
export function startOfTomorrowAppCalendarUtc(now: Date = new Date()): Date {
  const todayYmd = formatAppIsoDate(now);
  const [year, month, day] = todayYmd.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
}

export type AdvanceDueSampleSendLaterResult = {
  scanned: number;
  advanced: number;
  skippedFinance: number;
  failed: number;
};

/**
 * Advance sample/order_received orders whose send-later date has arrived
 * (planned day morning / after previous-day midnight Asia/Colombo) to print.
 */
export async function advanceDueSampleSendLaterOrders(
  now: Date = new Date()
): Promise<AdvanceDueSampleSendLaterResult> {
  const dueBefore = startOfTomorrowAppCalendarUtc(now);
  const dueOrders = await prisma.order.findMany({
    where: {
      fulfillmentStage: { in: ["order_received", "sample_free_issue"] },
      sampleFreeIssueSendLaterDate: { not: null, lt: dueBefore },
      financialStatus: { not: "voided" },
    },
    select: {
      id: true,
      companyId: true,
      fulfillmentStage: true,
      orderNumber: true,
      name: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      erpnextInvoiceId: true,
      sampleFreeIssueSendLaterDate: true,
    },
    orderBy: { sampleFreeIssueSendLaterDate: "asc" },
    take: 500,
  });

  let advanced = 0;
  let skippedFinance = 0;
  let failed = 0;

  for (const order of dueOrders) {
    try {
      const financeBlock = await getFinancePaymentApprovalBlockReason({
        id: order.id,
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        paymentGatewayNames: order.paymentGatewayNames,
        erpnextInvoiceId: order.erpnextInvoiceId,
      });
      if (financeBlock) {
        skippedFinance += 1;
        continue;
      }

      const at = now;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          ...orderStageUpdate("print", at),
          sampleFreeIssueCompleteAt: at,
          sampleFreeIssueCompleteById: null,
          sampleFreeIssueSendLaterDate: null,
        },
      });

      await writeAuditLog({
        companyId: order.companyId,
        actorUserId: null,
        module: "orders",
        action: "fulfillment_updated",
        entityType: "Order",
        entityId: order.id,
        summary: `Auto-advanced scheduled order ${order.orderNumber ?? order.name ?? order.id} to print (send-later date reached)`,
        beforeData: { fulfillmentStage: order.fulfillmentStage },
        afterData: { fulfillmentStage: "print" },
        metadata: {
          action: "auto_advance_sample_send_later",
          previousSendLaterDate: order.sampleFreeIssueSendLaterDate?.toISOString() ?? null,
        },
      });

      advanced += 1;
    } catch (err) {
      failed += 1;
      console.error(
        "[advance-sample-send-later] failed for order",
        order.id,
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    scanned: dueOrders.length,
    advanced,
    skippedFinance,
    failed,
  };
}
