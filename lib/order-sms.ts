import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/hutch-sms";

export type SmsTrigger =
  | "order_received"
  | "package_ready"
  | "dispatched"
  | "rider_dispatched"
  | "delivery_complete";

export type SmsContext = {
  orderNumber?: string;
  orderName?: string;
  customerName?: string;
  customerPhone?: string;
  locationName?: string;
  deliveryUrl?: string;
  riderName?: string;
  riderPhone?: string;
};

export async function sendOrderSms(
  companyId: string,
  orderId: string,
  trigger: SmsTrigger,
  context: SmsContext
): Promise<void> {
  const config = await prisma.smsNotificationConfig.findUnique({
    where: { companyId_trigger: { companyId, trigger } },
  });

  if (!config) {
    console.warn(`[Order SMS] ${trigger}: No config found for company ${companyId}. Enable and save in Settings > SMS Notifications.`);
    return;
  }
  if (!config.enabled) {
    return;
  }

  const sendToCustomer = config.sendToCustomer ?? true;
  const sendToRider = config.sendToRider ?? true;

  let message = config.template;
  message = message.replace(/\{orderNumber\}/g, context.orderNumber ?? "");
  message = message.replace(/\{orderName\}/g, context.orderName ?? "");
  message = message.replace(/\{customerName\}/g, context.customerName ?? "");
  message = message.replace(/\{locationName\}/g, context.locationName ?? "");
  message = message.replace(/\{deliveryUrl\}/g, context.deliveryUrl ?? "");
  message = message.replace(/\{riderName\}/g, context.riderName ?? "");
  message = message.replace(/\{riderPhone\}/g, context.riderPhone ?? "");

  const recipients: string[] = [];

  if (trigger === "rider_dispatched") {
    if (sendToRider && context.riderPhone?.trim()) {
      recipients.push(context.riderPhone.trim());
    }
    // Additional recipients receive rider_dispatched too (for testing/monitoring)
    const additional = (config.additionalRecipients as string[]) ?? [];
    recipients.push(...additional.filter((p) => p?.trim()));
  } else {
    if (sendToCustomer && context.customerPhone?.trim()) {
      recipients.push(context.customerPhone.trim());
    }
    // Additional recipients always receive (for testing/backup, even when sendToCustomer is off)
    const additional = (config.additionalRecipients as string[]) ?? [];
    recipients.push(...additional.filter((p) => p?.trim()));
  }

  const uniqueRecipients = [...new Set(recipients)].filter(Boolean);

  if (uniqueRecipients.length === 0) {
    console.warn(
      `[Order SMS] ${trigger} order ${orderId}: No recipients. ` +
        (trigger === "rider_dispatched"
          ? "Rider needs a phone number in their profile."
          : "Order needs customer phone or add additional recipients in SMS settings.")
    );
    return;
  }

  for (const phone of uniqueRecipients) {
    const result = await sendSms(companyId, phone, message);
    if (!result.success) {
      console.error(`[Order SMS] ${trigger} order ${orderId} to ${phone}: ${result.message}`);
    }
  }
}

export function getDeliveryUrl(order: { riderDeliveryToken: string | null }): string {
  if (!order.riderDeliveryToken) return "";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
  const protocol = base.startsWith("http") ? "" : "https://";
  return `${protocol}${base}/r/d/${order.riderDeliveryToken}`;
}
