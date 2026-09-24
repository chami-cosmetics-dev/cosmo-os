import { randomBytes } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

import { getAppBaseUrl } from "@/lib/app-base-url";
import { parseAppCalendarDayStart } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { registerUsersQrBodySchema } from "@/lib/validation/register-users";

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
  const parsed = registerUsersQrBodySchema.safeParse(raw);
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

  const token = randomBytes(32).toString("hex");
  await prisma.osRegistrationQr.create({
    data: {
      companyId,
      token,
      location: parsed.data.location,
      badgeStart,
      badgeEnd,
      createdByUserId: userId,
    },
  });

  const url = `${getAppBaseUrl()}/register/${token}`;
  const qrDataUrl = await QRCode.toDataURL(url);

  return NextResponse.json({ token, url, qrDataUrl });
}
