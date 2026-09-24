import { NextRequest, NextResponse } from "next/server";

import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { serializeCaptureRow } from "@/lib/register-users/serialize";
import {
  getOrCreateRegisterSettings,
  serializeEmailTemplate,
  todayHeaderDto,
  todayQrDto,
} from "@/lib/register-users/settings";
import { registerUsersPageDataQuerySchema } from "@/lib/validation/register-users";

export async function GET(request: NextRequest) {
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

  const parsed = registerUsersPageDataQuerySchema.safeParse({
    day: request.nextUrl.searchParams.get("day") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const today = formatAppIsoDate(new Date());
  const day = parsed.data.day ?? today;
  const dayStart = parseAppCalendarDayStart(day);
  const dayEnd = parseAppCalendarDayEnd(day);
  if (!dayStart || !dayEnd) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }

  const [rows, historyGroups, settings] = await Promise.all([
    prisma.osRegistrationCapture.findMany({
      where: {
        companyId,
        captureDate: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { createdAt: "desc" },
      include: {
        contact: { select: { name: true, phoneNumber: true, email: true } },
      },
    }),
    prisma.osRegistrationCapture.groupBy({
      by: ["captureDate"],
      where: { companyId },
      _count: { id: true },
      orderBy: { captureDate: "desc" },
    }),
    getOrCreateRegisterSettings(companyId),
  ]);

  const [header, qr] = await Promise.all([
    Promise.resolve(todayHeaderDto(settings, today)),
    todayQrDto(settings.latestQr, today),
  ]);

  return NextResponse.json({
    headerRequired: true,
    today,
    header,
    qr,
    emailTemplate: serializeEmailTemplate(settings),
    rows: rows.map((row) =>
      serializeCaptureRow({
        id: row.id,
        contactId: row.contactId,
        name: row.contact.name,
        phone: row.contact.phoneNumber,
        email: row.contact.email,
        location: row.location,
        badgeStart: row.badgeStart,
        badgeEnd: row.badgeEnd,
        source: row.source,
        outcome: row.outcome,
        createdAt: row.createdAt,
      }),
    ),
    historyDays: historyGroups.map((g) => ({
      date: formatAppIsoDate(g.captureDate),
      count: g._count.id,
    })),
  });
}
