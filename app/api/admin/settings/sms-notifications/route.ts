import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { trimmedString } from "@/lib/validation";

const TRIGGERS = [
  "order_received",
  "package_ready",
  "dispatched",
  "rider_dispatched",
  "delivery_complete",
] as const;

const createSchema = z.object({
  trigger: z.enum(TRIGGERS),
  enabled: z.boolean(),
  sendToCustomer: z.boolean().optional().default(true),
  sendToRider: z.boolean().optional().default(true),
  template: trimmedString(1, 1000),
  additionalRecipients: z
    .string()
    .optional()
    .transform((s) => {
      if (!s?.trim()) return [] as string[];
      return s
        .split(/,|\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 10);
    }),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET() {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  let configs = await prisma.smsNotificationConfig.findMany({
    where: { companyId },
    orderBy: { trigger: "asc" },
  });

  if (configs.length < TRIGGERS.length) {
    const existingTriggers = new Set(configs.map((c) => c.trigger));
    for (const trigger of TRIGGERS) {
      if (!existingTriggers.has(trigger)) {
        await prisma.smsNotificationConfig.upsert({
          where: { companyId_trigger: { companyId, trigger } },
          create: {
            companyId,
            trigger,
            enabled: false,
            sendToCustomer: true,
            sendToRider: true,
            template: getDefaultTemplate(trigger),
            additionalRecipients: [],
          },
          update: {},
        });
        existingTriggers.add(trigger);
      }
    }
    configs = await prisma.smsNotificationConfig.findMany({
      where: { companyId },
      orderBy: { trigger: "asc" },
    });
  }

  const legacyRiderTemplate =
    "Order {orderNumber} assigned for delivery. Confirm when delivered: {deliveryUrl}";
  const riderConfig = configs.find((c) => c.trigger === "rider_dispatched");
  if (riderConfig?.template === legacyRiderTemplate) {
    const updatedTemplate = getDefaultTemplate("rider_dispatched");
    await prisma.smsNotificationConfig.update({
      where: { id: riderConfig.id },
      data: { template: updatedTemplate },
    });
    riderConfig.template = updatedTemplate;
  }

  const byTrigger = Object.fromEntries(
    configs.map((c) => [
      c.trigger,
      {
        id: c.id,
        trigger: c.trigger,
        enabled: c.enabled,
        sendToCustomer: c.sendToCustomer ?? true,
        sendToRider: c.sendToRider ?? true,
        template: c.template,
        additionalRecipients: (c.additionalRecipients as string[]) ?? [],
      },
    ])
  );

  const result = TRIGGERS.map((t) => {
    const existing = byTrigger[t];
    return {
      trigger: t,
      id: existing?.id ?? null,
      enabled: existing?.enabled ?? false,
      sendToCustomer: existing?.sendToCustomer ?? true,
      sendToRider: existing?.sendToRider ?? true,
      template: existing?.template ?? getDefaultTemplate(t),
      additionalRecipients: existing?.additionalRecipients ?? [],
    };
  });

  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { trigger, enabled, sendToCustomer, sendToRider, template, additionalRecipients } =
    parsed.data;

  const existing = await prisma.smsNotificationConfig.findUnique({
    where: {
      companyId_trigger: { companyId, trigger },
    },
    select: {
      id: true,
      enabled: true,
      sendToCustomer: true,
      sendToRider: true,
      template: true,
      additionalRecipients: true,
    },
  });

  await prisma.smsNotificationConfig.upsert({
    where: {
      companyId_trigger: { companyId, trigger },
    },
    create: {
      companyId,
      trigger,
      enabled,
      sendToCustomer: sendToCustomer ?? true,
      sendToRider: sendToRider ?? true,
      template,
      additionalRecipients: additionalRecipients as object,
    },
    update: {
      enabled,
      sendToCustomer: sendToCustomer ?? true,
      sendToRider: sendToRider ?? true,
      template,
      additionalRecipients: additionalRecipients as object,
    },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: existing ? "setting_updated" : "setting_created",
    entityType: "SmsNotificationConfig",
    entityId: existing?.id ?? trigger,
    summary: `${existing ? "Updated" : "Created"} SMS notification setting for ${trigger}`,
    beforeData: existing,
    afterData: {
      trigger,
      enabled,
      sendToCustomer: sendToCustomer ?? true,
      sendToRider: sendToRider ?? true,
      template,
      additionalRecipients,
    },
  });

  return NextResponse.json({ success: true });
}

function getDefaultTemplate(trigger: string): string {
  const defaults: Record<string, string> = {
    order_received:
      "Hi! Your order {orderNumber} has been received. Thank you for your purchase.",
    package_ready:
      "Your order {orderNumber} is ready for dispatch. We will notify you when it ships.",
    dispatched:
      "Your order {orderNumber} has been dispatched. Track your delivery for updates.",
    rider_dispatched:
      "Invoice {invoiceNumber} assigned for delivery. Confirm when delivered: {deliveryUrl}",
    delivery_complete:
      "Your order {orderNumber} has been delivered. Thank you for shopping with us!",
  };
  return defaults[trigger] ?? "Order {orderNumber} update.";
}




