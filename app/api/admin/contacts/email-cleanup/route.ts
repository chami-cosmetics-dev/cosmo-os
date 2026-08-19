import { NextResponse } from "next/server";

import { listSuspectEmails } from "@/lib/contacts/email-cleanup";
import { requireAnyPermission } from "@/lib/rbac";
import { contactEmailCleanupListQuerySchema } from "@/lib/validation/contact-email-cleanup";

export async function GET(request: Request) {
  const auth = await requireAnyPermission(["contacts.master.manage", "contacts.manage"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const url = new URL(request.url);
  const parsed = contactEmailCleanupListQuerySchema.safeParse({
    reason: url.searchParams.get("reason") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const result = await listSuspectEmails({
    companyId,
    reason: parsed.data.reason,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return NextResponse.json(result);
}
