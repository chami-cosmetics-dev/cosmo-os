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

export async function sendOrderSms(
  companyId: string,
  orderId: string,
  trigger: SmsTrigger,
  context: SmsContext,
): Promise<void> {
  const config = await prisma.smsNotificationConfig.findUnique({
    where: { companyId_trigger: { companyId, trigger } },
  });

  if (!config) {
    console.warn(`[Order SMS] ${trigger}: No config found for company ${companyId}. Enable and save in Settings > SMS Notifications.`);
    return;
  }
  if (!config.enabled) {
    console.warn(
      `[Order SMS] ${trigger} order ${orderId}: skipped — trigger disabled in Settings > SMS Notifications.`,
    );
    return;
  }

  const sendToCustomer = config.sendToCustomer ?? true;
  const sendToRider = config.sendToRider ?? true;

  let message = config.template;
  message = message.replace(/\{orderNumber\}/g, context.orderNumber ?? "");
  message = message.replace(/\{orderName\}/g, context.orderName ?? "");
  message = message.replace(/\{invoiceNumber\}/g, context.invoiceNumber ?? "");
  message = message.replace(/\{orderReference\}/g, context.orderReference ?? "");
  message = message.replace(/\{customerName\}/g, context.customerName ?? "");
  message = message.replace(/\{locationName\}/g, context.locationName ?? "");
  message = message.replace(/\{deliveryUrl\}/g, context.deliveryUrl ?? "");
  message = message.replace(/\{riderName\}/g, context.riderName ?? "");
  message = message.replace(/\{riderPhone\}/g, context.riderPhone ?? "");

  const recipients: string[] = [];

  if (trigger === "rider_dispatched") {
    if (!context.invoiceNumber?.trim()) {
      console.warn(
        `[Order SMS] rider_dispatched order ${orderId}: skipped — no ERP invoice number. ` +
          "Ensure the order is synced to ERPNext (erpnextInvoiceId) before assigning a rider.",
      );
      return;
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
    return;
  }

  console.info(
    `[Order SMS] ${trigger} order ${orderId}: sending to ${uniqueRecipients.length} recipient(s)`,
  );

  for (const phone of uniqueRecipients) {
    const result = await sendSms(companyId, phone, message);
    if (!result.success) {
      console.error(`[Order SMS] ${trigger} order ${orderId} to ${phone}: ${result.message}`);
    } else {
      console.info(`[Order SMS] ${trigger} order ${orderId} to ${phone}: sent`);
    }
  }
}
