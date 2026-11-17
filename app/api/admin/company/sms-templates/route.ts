import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  builtinSmsTemplateByKey,
  isSmsTemplatePurpose,
  isValidSmsTemplateKey,
} from "@/lib/sms-templates/catalog";
import { getLoyaltySmsOfficePhone } from "@/lib/sms-templates/loyalty-sms-config";
import { mergeSmsTemplates } from "@/lib/sms-templates/merge";
import { LIMITS, trimmedString } from "@/lib/validation";

const upsertSchema = z.object({
  key: trimmedString(1, LIMITS.smsTemplateKey.max).refine(isValidSmsTemplateKey, {
    message: "Key must be lowercase letters, numbers, underscore (start with letter)",
  }),
  name: trimmedString(1, LIMITS.smsTemplateName.max),
  purpose: trimmedString(1, 32),
  body: trimmedString(1, LIMITS.smsTemplateBody.max),
  active: z.boolean().optional().default(true),
});

const deleteSchema = z.object({
  key: trimmedString(1, LIMITS.smsTemplateKey.max).refine(isValidSmsTemplateKey),
});

async function companyIdForUser(userId: string): Promise<string | null> {
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

  const companyId = await companyIdForUser(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const [templates, officeContactPhone] = await Promise.all([
    prisma.smsTemplate.findMany({
      where: { companyId },
      select: {
        id: true,
        key: true,
        name: true,
        purpose: true,
        body: true,
        active: true,
      },
    }),
    getLoyaltySmsOfficePhone(companyId),
  ]);

  return NextResponse.json({
    templates: mergeSmsTemplates(templates),
    officeContactPhone,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await companyIdForUser(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const builtin = builtinSmsTemplateByKey(parsed.data.key);
  let purpose = parsed.data.purpose;
  if (builtin) {
    purpose = builtin.purpose;
  } else if (!isSmsTemplatePurpose(purpose)) {
    return NextResponse.json(
      { error: "purpose must be gold_wish, platinum_wish, or custom" },
      { status: 400 },
    );
  }

  const name = parsed.data.name.trim();
  const templateBody = parsed.data.body.trim();
  if (!templateBody) {
    return NextResponse.json({ error: "Body cannot be empty" }, { status: 400 });
  }

  const row = await prisma.smsTemplate.upsert({
    where: { companyId_key: { companyId, key: parsed.data.key } },
    create: {
      companyId,
      key: parsed.data.key,
      name,
      purpose,
      body: templateBody,
      active: parsed.data.active,
    },
    update: {
      name,
      purpose: builtin ? builtin.purpose : purpose,
      body: templateBody,
      active: parsed.data.active,
    },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_updated",
    entityType: "SmsTemplate",
    entityId: row.id,
    summary: `Saved SMS template ${row.key}`,
    afterData: {
      key: row.key,
      name: row.name,
      purpose: row.purpose,
      active: row.active,
    },
  });

  const [templates, officeContactPhone] = await Promise.all([
    prisma.smsTemplate.findMany({
      where: { companyId },
      select: {
        id: true,
        key: true,
        name: true,
        purpose: true,
        body: true,
        active: true,
      },
    }),
    getLoyaltySmsOfficePhone(companyId),
  ]);
  const dto = mergeSmsTemplates(templates).find((t) => t.key === row.key);

  return NextResponse.json({
    ok: true,
    template: dto,
    templates: mergeSmsTemplates(templates),
    officeContactPhone,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("settings.sms_portal");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await companyIdForUser(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (builtinSmsTemplateByKey(parsed.data.key)) {
    return NextResponse.json(
      { error: "Built-in templates cannot be deleted" },
      { status: 400 },
    );
  }

  const existing = await prisma.smsTemplate.findUnique({
    where: { companyId_key: { companyId, key: parsed.data.key } },
    select: { id: true, key: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await prisma.smsTemplate.delete({ where: { id: existing.id } });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_deleted",
    entityType: "SmsTemplate",
    entityId: existing.id,
    summary: `Deleted SMS template ${existing.key}`,
    beforeData: { key: existing.key },
  });

  return NextResponse.json({ ok: true });
}
