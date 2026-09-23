import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import {
  BUILTIN_EMAIL_TEMPLATES,
  builtinTemplateByKey,
  isValidEmailTemplateKey,
} from "@/lib/email-templates/catalog";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

export type EmailTemplateDto = {
  id: string | null;
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  recipients: string;
  ccRecipients: string;
  placeholders: string[];
  builtin: boolean;
  automated: boolean;
  saved: boolean;
};

const upsertSchema = z.object({
  key: trimmedString(1, 64).refine(isValidEmailTemplateKey, {
    message: "Key must be lowercase letters, numbers, underscore (start with letter)",
  }),
  name: trimmedString(1, 120),
  subject: trimmedString(0, LIMITS.emailTemplateSubject.max),
  bodyHtml: trimmedString(0, LIMITS.emailTemplateBody.max),
  recipients: z.string().max(LIMITS.emailTemplateRecipients.max).transform((s) => s.trim()),
  ccRecipients: z
    .string()
    .max(LIMITS.emailTemplateRecipients.max)
    .transform((s) => s.trim())
    .optional()
    .default(""),
});

const deleteSchema = z.object({
  key: trimmedString(1, 64).refine(isValidEmailTemplateKey),
});

function mergeTemplates(
  stored: Array<{
    id: string;
    key: string;
    name: string;
    subject: string;
    bodyHtml: string;
    recipients: string;
    ccRecipients: string;
  }>,
): EmailTemplateDto[] {
  const byKey = new Map(stored.map((t) => [t.key, t]));
  const out: EmailTemplateDto[] = [];

  for (const builtin of BUILTIN_EMAIL_TEMPLATES) {
    const row = byKey.get(builtin.key);
    out.push({
      id: row?.id ?? null,
      key: builtin.key,
      name: row?.name ?? builtin.name,
      subject: row?.subject ?? builtin.subject,
      bodyHtml: row?.bodyHtml ?? builtin.bodyHtml,
      recipients: row?.recipients ?? builtin.recipients,
      ccRecipients: row?.ccRecipients ?? builtin.ccRecipients,
      placeholders: builtin.placeholders,
      builtin: true,
      automated: Boolean(builtin.automated),
      saved: Boolean(row),
    });
    byKey.delete(builtin.key);
  }

  for (const row of byKey.values()) {
    out.push({
      id: row.id,
      key: row.key,
      name: row.name,
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      recipients: row.recipients,
      ccRecipients: row.ccRecipients,
      placeholders: [],
      builtin: false,
      automated: false,
      saved: true,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

export async function GET() {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const templates = await prisma.emailTemplate.findMany({
    where: { companyId: user.companyId },
    select: {
      id: true,
      key: true,
      name: true,
      subject: true,
      bodyHtml: true,
      recipients: true,
      ccRecipients: true,
    },
  });

  return NextResponse.json({ templates: mergeTemplates(templates) });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
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

  const { key, name, subject, bodyHtml, recipients, ccRecipients } = parsed.data;
  const builtin = builtinTemplateByKey(key);

  const existing = await prisma.emailTemplate.findUnique({
    where: { companyId_key: { companyId: user.companyId, key } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Template key already exists — use PATCH to update" },
      { status: 409 },
    );
  }

  const created = await prisma.emailTemplate.create({
    data: {
      companyId: user.companyId,
      key,
      name: builtin?.name ?? name,
      subject,
      bodyHtml,
      recipients,
      ccRecipients,
    },
  });

  await writeAuditLog({
    companyId: user.companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_created",
    entityType: "EmailTemplate",
    entityId: created.id,
    summary: `Created email template ${key}`,
    afterData: { key, name: created.name, subject, recipients, ccRecipients },
  });

  return NextResponse.json({ success: true, id: created.id, key });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
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

  const { key, name, subject, bodyHtml, recipients, ccRecipients } = parsed.data;
  const builtin = builtinTemplateByKey(key);
  const resolvedName = builtin?.name ?? name;

  const existing = await prisma.emailTemplate.findUnique({
    where: { companyId_key: { companyId: user.companyId, key } },
    select: {
      id: true,
      subject: true,
      bodyHtml: true,
      recipients: true,
      ccRecipients: true,
      name: true,
    },
  });

  await prisma.emailTemplate.upsert({
    where: { companyId_key: { companyId: user.companyId, key } },
    create: {
      companyId: user.companyId,
      key,
      name: resolvedName,
      subject,
      bodyHtml,
      recipients,
      ccRecipients,
    },
    update: {
      name: resolvedName,
      subject,
      bodyHtml,
      recipients,
      ccRecipients,
    },
  });

  await writeAuditLog({
    companyId: user.companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: existing ? "setting_updated" : "setting_created",
    entityType: "EmailTemplate",
    entityId: existing?.id ?? key,
    summary: `${existing ? "Updated" : "Created"} email template ${key}`,
    beforeData: existing,
    afterData: { subject, bodyHtml, recipients, ccRecipients, name: resolvedName },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
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

  const { key } = parsed.data;
  if (builtinTemplateByKey(key)) {
    return NextResponse.json(
      { error: "Built-in templates cannot be deleted — clear recipients or edit instead" },
      { status: 400 },
    );
  }

  const existing = await prisma.emailTemplate.findUnique({
    where: { companyId_key: { companyId: user.companyId, key } },
    select: { id: true, key: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await prisma.emailTemplate.delete({
    where: { companyId_key: { companyId: user.companyId, key } },
  });

  await writeAuditLog({
    companyId: user.companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_deleted",
    entityType: "EmailTemplate",
    entityId: existing.id,
    summary: `Deleted email template ${key}`,
    beforeData: existing,
  });

  return NextResponse.json({ success: true });
}
