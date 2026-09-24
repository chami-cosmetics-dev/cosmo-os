import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import {
  serializeEmailTemplate,
  upsertRegisterEmailTemplate,
} from "@/lib/register-users/settings";
import { registerUsersEmailTemplateBodySchema } from "@/lib/validation/register-users";

export async function PUT(request: NextRequest) {
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
  const parsed = registerUsersEmailTemplateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const photoUrl =
    parsed.data.photoUrl === "" || parsed.data.photoUrl == null
      ? parsed.data.photoUrl === ""
        ? null
        : undefined
      : parsed.data.photoUrl;

  const settings = await upsertRegisterEmailTemplate(companyId, {
    header: parsed.data.header,
    body: parsed.data.body,
    photoUrl,
  });

  return NextResponse.json({ emailTemplate: serializeEmailTemplate(settings) });
}
