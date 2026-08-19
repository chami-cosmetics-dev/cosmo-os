import { NextResponse } from "next/server";

import { clearSuspectEmails } from "@/lib/contacts/email-cleanup";
import { requireAnyPermission } from "@/lib/rbac";
import { contactEmailCleanupClearBodySchema } from "@/lib/validation/contact-email-cleanup";

export async function POST(request: Request) {
  const auth = await requireAnyPermission(["contacts.master.manage", "contacts.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  const actorUserId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = contactEmailCleanupClearBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const result = await clearSuspectEmails({
    companyId,
    actorUserId,
    reason: parsed.data.reason,
    contactIds: parsed.data.contactIds,
  });

  return NextResponse.json(result);
}
