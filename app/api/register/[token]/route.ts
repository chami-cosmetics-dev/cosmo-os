import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendRegisterWelcomeIfConfigured } from "@/lib/register-users/email";
import { saveRegisteredUser } from "@/lib/register-users/save";
import { RegisterPhoneConflictError } from "@/lib/register-users/types";
import { registerPortalSaveBodySchema } from "@/lib/validation/register-users";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const qr = await prisma.osRegistrationQr.findUnique({
    where: { token },
    select: { location: true },
  });
  if (!qr) {
    return NextResponse.json({ error: "Unknown registration link" }, { status: 404 });
  }
  return NextResponse.json({ locationLabel: qr.location });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const qr = await prisma.osRegistrationQr.findUnique({
    where: { token },
    select: {
      id: true,
      companyId: true,
      location: true,
      badgeStart: true,
      badgeEnd: true,
    },
  });
  if (!qr) {
    return NextResponse.json({ error: "Unknown registration link" }, { status: 404 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = registerPortalSaveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await saveRegisteredUser({
      companyId: qr.companyId,
      name: parsed.data.name,
      phoneNumber: parsed.data.phoneNumber,
      email: parsed.data.email,
      birthYear: parsed.data.birthYear,
      birthMonth: parsed.data.birthMonth,
      birthDay: parsed.data.birthDay,
      location: qr.location,
      badgeStart: qr.badgeStart,
      badgeEnd: qr.badgeEnd,
      source: "portal",
      qrId: qr.id,
      applyBirthday: true,
    });
    void sendRegisterWelcomeIfConfigured({
      companyId: qr.companyId,
      name: result.row.name,
      email: result.row.email,
    });
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    if (error instanceof RegisterPhoneConflictError) {
      return NextResponse.json({ error: "Unable to save this phone" }, { status: 409 });
    }
    throw error;
  }
}
