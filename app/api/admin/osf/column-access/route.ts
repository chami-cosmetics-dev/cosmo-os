import { NextRequest, NextResponse } from "next/server";

import {
  listPurchasingUsersForColumnAccess,
  PURCHASING_OSF_TOOLS_PERMISSION_KEYS,
} from "@/lib/osf/column-visibility";
import { OSF_OPTIONAL_GROUP_META, normalizeOptionalColumnGroups } from "@/lib/osf/column-groups";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { osfColumnAccessPutSchema } from "@/lib/validation/osf";

export async function GET() {
  const auth = await requirePermission("purchasing.osf.permission");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const [users, marks] = await Promise.all([
    listPurchasingUsersForColumnAccess(companyId),
    prisma.osfUserColumnAccess.findMany({
      where: { companyId },
      select: { userId: true, columnGroups: true },
    }),
  ]);

  const marksByUser = new Map(marks.map((m) => [m.userId, m.columnGroups]));

  return NextResponse.json({
    groups: OSF_OPTIONAL_GROUP_META,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      columnGroups: normalizeOptionalColumnGroups(marksByUser.get(u.id) ?? []),
    })),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.permission");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = osfColumnAccessPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const assignments =
    "assignments" in parsed.data ? parsed.data.assignments : [parsed.data];

  const userIds = assignments.map((a) => a.userId);
  const eligible = await listPurchasingUsersForColumnAccess(companyId);
  const eligibleIds = new Set(eligible.map((u) => u.id));
  for (const userId of userIds) {
    if (!eligibleIds.has(userId)) {
      return NextResponse.json(
        { error: "User is not eligible for OSF column access assignment" },
        { status: 404 },
      );
    }
  }

  const updated = await Promise.all(
    assignments.map((a) =>
      prisma.osfUserColumnAccess.upsert({
        where: { companyId_userId: { companyId, userId: a.userId } },
        create: {
          companyId,
          userId: a.userId,
          columnGroups: normalizeOptionalColumnGroups(a.columnGroups),
        },
        update: {
          columnGroups: normalizeOptionalColumnGroups(a.columnGroups),
        },
        select: { userId: true, columnGroups: true },
      }),
    ),
  );

  return NextResponse.json({
    users: updated.map((row) => ({
      userId: row.userId,
      columnGroups: normalizeOptionalColumnGroups(row.columnGroups),
    })),
    permissionKeys: PURCHASING_OSF_TOOLS_PERMISSION_KEYS,
  });
}
