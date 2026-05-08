import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const RESIGNATION_DEFAULT = {
  key: "resignation_notice",
  name: "Resignation Notice",
  subject: "Staff Resignation: {{staffName}}",
  bodyHtml: `<p>This is to inform you that the following staff member has resigned and the offboarding process has been completed.</p>
<ul>
<li><strong>Name:</strong> {{staffName}}</li>
<li><strong>Resignation date:</strong> {{resignationDate}}</li>
<li><strong>Reason:</strong> {{reason}}</li>
<li><strong>Employee number:</strong> {{employeeNumber}}</li>
<li><strong>Department:</strong> {{department}}</li>
<li><strong>Designation:</strong> {{designation}}</li>
<li><strong>Location:</strong> {{location}}</li>
</ul>`,
  recipients: "",
};

const updateTemplateSchema = z.object({
  key: z.literal("resignation_notice"),
  subject: trimmedString(0, LIMITS.emailTemplateSubject.max),
  bodyHtml: trimmedString(0, LIMITS.emailTemplateBody.max),
  recipients: z.string().max(LIMITS.emailTemplateRecipients.max).transform((s) => s.trim()),
});

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
      { status: 404 }
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
    },
  });

  const resignation = templates.find((t) => t.key === "resignation_notice");
  const result = {
    resignation_notice: resignation ?? {
      ...RESIGNATION_DEFAULT,
      id: null,
    },
  };

  return NextResponse.json(result);
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
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { key, subject, bodyHtml, recipients } = parsed.data;

  await prisma.emailTemplate.upsert({
    where: {
      companyId_key: { companyId: user.companyId, key },
    },
    create: {
      companyId: user.companyId,
      key,
      name: RESIGNATION_DEFAULT.name,
      subject,
      bodyHtml,
      recipients,
    },
    update: {
      subject,
      bodyHtml,
      recipients,
    },
  });

  return NextResponse.json({ success: true });
}
