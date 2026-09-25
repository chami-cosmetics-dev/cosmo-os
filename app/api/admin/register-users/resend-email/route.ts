import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  sendRegisterWelcomeIfConfigured,
  stampCaptureEmail,
} from "@/lib/register-users/email";
import { registerUsersResendEmailBodySchema } from "@/lib/validation/register-users";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.register");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = registerUsersResendEmailBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const capture = await prisma.osRegistrationCapture.findFirst({
    where: { id: parsed.data.captureId, companyId },
    select: {
      outcome: true,
      contact: { select: { name: true, email: true } },
    },
  });
  if (!capture) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }
  if (capture.outcome !== "created") {
    return NextResponse.json(
      { error: "Resend is only for newly created users" },
      { status: 400 },
    );
  }

  const email = await sendRegisterWelcomeIfConfigured({
    companyId,
    name: capture.contact.name,
    email: capture.contact.email,
  });
  await stampCaptureEmail(parsed.data.captureId, email);
  if (email.status !== "sent") {
    const message =
      email.status === "skipped" && email.reason === "no_email"
        ? "No email on this contact"
        : email.status === "skipped"
          ? "Email template empty"
          : email.error;
    return NextResponse.json({ error: message, email }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email });
}
