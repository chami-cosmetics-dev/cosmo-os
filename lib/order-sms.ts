import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/hutch-sms";

export type { SmsContext, SmsTrigger } from "@/lib/order-sms-resolvers";
export {
  getDeliveryUrl,
  resolveCustomerPhone,
  resolveOrderInvoiceNumber,
  resolveOrderNumber,
} from "@/lib/order-sms-resolvers";

import type { SmsContext, SmsTrigger } from "@/lib/order-sms-resolvers";

export type SendOrderSmsResult = {
  /** Recipients the SMS provider accepted. */
  sent: number;
  /** Recipients the provider rejected. */
  failed: number;
  /** Set when nothing was attempted at all (trigger off, or required data missing). */
  skipped?: string;
  /** Provider messages for the recipients that failed. */
  errors: string[];
};

/**
 * Why a send produced no delivered message, or null when at least one went out.
 * Callers that report back to a user (manual re-send endpoints) must check this —
 * sendOrderSms resolves normally on provider failure, so awaiting it is not proof
 * anything was actually sent.
 */
export function orderSmsFailureReason(result: SendOrderSmsResult): string | null {
  if (result.sent > 0) return null;
  if (result.skipped) return result.skipped;
  return result.errors[0] ?? "SMS provider did not accept the message";
}

export async function sendOrderSms(
  companyId: string,
  orderId: string,
  trigger: SmsTrigger,
  context: SmsContext,
): Promise<SendOrderSmsResult> {
  const config = await prisma.smsNotificationConfig.findUnique({
    where: { companyId_trigger: { companyId, trigger } },
  });

  if (!config) {
    console.warn(`[Order SMS] ${trigger}: No config found for company ${companyId}. Enable and save in Settings > SMS Notifications.`);
    return {
      sent: 0,
      failed: 0,
      skipped: "No SMS settings for this trigger. Enable and save it in Settings > SMS Notifications.",
      errors: [],
    };
  }
  if (!config.enabled) {
    console.warn(
      `[Order SMS] ${trigger} order ${orderId}: skipped — trigger disabled in Settings > SMS Notifications.`,
    );
    return {
      sent: 0,
      failed: 0,
      skipped: "This SMS trigger is disabled in Settings > SMS Notifications.",
      errors: [],
    };
  }

  const sendToCustomer = config.sendToCustomer ?? true;
  const sendToRider = config.sendToRider ?? true;

  // Rider SMS previously skipped entirely when ERP SI wasn't synced yet — that dropped
  // messages for Shopify orders (600…) dispatched before erpnextInvoiceId was set.
  // Fall back to the Cosmo/Shopify order number so the rider still gets the delivery link.
  const invoiceForTemplate =
    context.invoiceNumber?.trim() ||
    (trigger === "rider_dispatched" ? context.orderNumber?.trim() || "" : "");
  const orderReferenceForTemplate =
    context.orderReference?.trim() ||
    [context.orderNumber?.trim(), context.invoiceNumber?.trim()].filter(Boolean).join(" / ");

  if (
    trigger === "rider_dispatched" &&
    !context.invoiceNumber?.trim() &&
    context.orderNumber?.trim()
  ) {
    console.warn(
      `[Order SMS] rider_dispatched order ${orderId}: no ERP invoice — using order number ${context.orderNumber.trim()}`,
    );
  }

  let message = config.template;
  message = message.replace(/\{orderNumber\}/g, context.orderNumber ?? "");
  message = message.replace(/\{orderName\}/g, context.orderName ?? "");
  message = message.replace(/\{invoiceNumber\}/g, invoiceForTemplate);
  message = message.replace(/\{orderReference\}/g, orderReferenceForTemplate);
  message = message.replace(/\{customerName\}/g, context.customerName ?? "");
  message = message.replace(/\{locationName\}/g, context.locationName ?? "");
  message = message.replace(/\{deliveryUrl\}/g, context.deliveryUrl ?? "");
  message = message.replace(/\{riderName\}/g, context.riderName ?? "");
  message = message.replace(/\{riderPhone\}/g, context.riderPhone ?? "");

  const recipients: string[] = [];

  if (trigger === "rider_dispatched") {
    if (!invoiceForTemplate) {
      console.warn(
        `[Order SMS] rider_dispatched order ${orderId}: skipped — no ERP invoice number or order number. ` +
          "Ensure the order is synced to ERPNext (erpnextInvoiceId) before assigning a rider.",
      );
      return {
        sent: 0,
        failed: 0,
        skipped:
          "No ERP invoice number or order number on this order. Sync it to ERPNext before assigning a rider.",
        errors: [],
      };
    }
    if (sendToRider && context.riderPhone?.trim()) {
      recipients.push(context.riderPhone.trim());
    }
    const additional = (config.additionalRecipients as string[]) ?? [];
    recipients.push(...additional.filter((p) => p?.trim()));
  } else {
    if (sendToCustomer && context.customerPhone?.trim()) {
      recipients.push(context.customerPhone.trim());
    }
    const additional = (config.additionalRecipients as string[]) ?? [];
    recipients.push(...additional.filter((p) => p?.trim()));
  }

  const uniqueRecipients = [...new Set(recipients)].filter(Boolean);

  if (uniqueRecipients.length === 0) {
    console.warn(
      `[Order SMS] ${trigger} order ${orderId}: No recipients. ` +
        (trigger === "rider_dispatched"
          ? "Rider needs a phone number in their profile."
          : `Customer phone missing (sendToCustomer=${sendToCustomer}). Add a phone on the order or additional recipients in SMS settings.`),
    );
    return {
      sent: 0,
      failed: 0,
      skipped:
        trigger === "rider_dispatched"
          ? "Rider has no phone number in their profile."
          : "No customer phone on this order, and no additional recipients configured.",
      errors: [],
    };
  }

  console.info(
    `[Order SMS] ${trigger} order ${orderId}: sending to ${uniqueRecipients.length} recipient(s)`,
  );

  let sent = 0;
  const errors: string[] = [];

  for (const phone of uniqueRecipients) {
    const result = await sendSms(companyId, phone, message);
    if (!result.success) {
      errors.push(result.message);
      console.error(`[Order SMS] ${trigger} order ${orderId} to ${phone}: ${result.message}`);
    } else {
      sent++;
      console.info(`[Order SMS] ${trigger} order ${orderId} to ${phone}: sent`);
    }
  }

  return { sent, failed: errors.length, errors };
}

