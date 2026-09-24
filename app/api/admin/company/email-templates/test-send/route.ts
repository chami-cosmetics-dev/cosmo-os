import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  parseEmailAddressList,
  renderEmailTemplatePlaceholders,
} from "@/lib/email-templates/render";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";

const testSendSchema = z.object({
  key: trimmedString(1, 64),
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

const SAMPLE_PLACEHOLDERS: Record<string, string | number> = {
  companyName: "Cosmo OS",
  reportDate: new Date().toISOString().slice(0, 10),
  generatedAt: new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" }),
  total: 12,
  notHandedOver: 4,
  notValued: 5,
  grnNotReceived: 3,
  summaryTableHtml:
    "<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\"><tbody><tr><td>Not handed over</td><td>4</td></tr><tr><td>Not valued</td><td>5</td></tr><tr><td>GRN not received</td><td>3</td></tr><tr><td>Total</td><td>12</td></tr></tbody></table>",
  staffName: "Sample Staff",
  resignationDate: new Date().toISOString().slice(0, 10),
  reason: "Test email",
  employeeNumber: "EMP-000",
  department: "Sample Department",
  designation: "Sample Designation",
  location: "Sample Location",
  itemCount: 10,
  erp1Label: "ERP 1",
  erp2Label: "ERP 2",
  erp1Count: 4,
  erp2Count: 6,
  erp1MissingStandardCount: 1,
  erp1MissingOgfCount: 1,
  erp1MissingBothCount: 2,
  erp2MissingStandardCount: 2,
  erp2MissingOgfCount: 1,
  erp2MissingBothCount: 3,
  erp1TableHtml: "<p>Sample ERP 1 table.</p>",
  erp2TableHtml: "<p>Sample ERP 2 table.</p>",
};

function htmlToPlain(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = testSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const toEmails = parseEmailAddressList(parsed.data.recipients);
  const ccEmails = parseEmailAddressList(parsed.data.ccRecipients);
  if (toEmails.length === 0) {
    return NextResponse.json({ error: "Add at least one To recipient before sending a test." }, { status: 400 });
  }

  const subject = `[TEST] ${renderEmailTemplatePlaceholders(parsed.data.subject, SAMPLE_PLACEHOLDERS)}`;
  const html = `<p style="color:#666;font-size:12px;">Test email for template <strong>${parsed.data.name}</strong> (${parsed.data.key}).</p>${renderEmailTemplatePlaceholders(parsed.data.bodyHtml, SAMPLE_PLACEHOLDERS)}`;
  const plain = htmlToPlain(html) || subject;

  const result = await sendErpSyncFailureAlertEmail({
    toEmails,
    ccEmails,
    subject,
    html,
    plain,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.message ?? "Failed to send test email" }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
