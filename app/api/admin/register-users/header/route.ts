import { NextRequest, NextResponse } from "next/server";

import { formatAppIsoDate, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { requirePermission } from "@/lib/rbac";
import { upsertRegisterHeader } from "@/lib/register-users/settings";
import { registerUsersHeaderBodySchema } from "@/lib/validation/register-users";

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
  const parsed = registerUsersHeaderBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const badgeStart = parseAppCalendarDayStart(parsed.data.badgeStart);
  const badgeEnd = parseAppCalendarDayStart(parsed.data.badgeEnd);
  if (!badgeStart || !badgeEnd) {
    return NextResponse.json({ error: "Invalid badge dates" }, { status: 400 });
  }

  await upsertRegisterHeader(companyId, {
    location: parsed.data.location,
    badgeStart,
    badgeEnd,
    headerDate: formatAppIsoDate(new Date()),
  });

  return NextResponse.json({ ok: true });
}
