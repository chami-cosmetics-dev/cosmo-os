import { NextRequest, NextResponse } from "next/server";

import { parseAppCalendarDayStart } from "@/lib/format-datetime";
import { requirePermission } from "@/lib/rbac";
import { saveRegisteredUser } from "@/lib/register-users/save";
import { RegisterPhoneConflictError } from "@/lib/register-users/types";
import { registerUsersSaveBodySchema } from "@/lib/validation/register-users";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.register");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const userId = auth.context!.user?.id ?? null;
  if (!companyId || !userId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = registerUsersSaveBodySchema.safeParse(raw);
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

  try {
    const result = await saveRegisteredUser({
      companyId,
      name: parsed.data.name,
      phoneNumber: parsed.data.phoneNumber,
      email: parsed.data.email,
      birthYear: parsed.data.birthYear,
      birthMonth: parsed.data.birthMonth,
      birthDay: parsed.data.birthDay,
      location: parsed.data.location,
      badgeStart,
      badgeEnd,
      source: "staff",
      actorUserId: userId,
      applyBirthday: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RegisterPhoneConflictError) {
      return NextResponse.json(
        { error: error.message, matches: error.matches },
        { status: 409 },
      );
    }
    throw error;
  }
}
