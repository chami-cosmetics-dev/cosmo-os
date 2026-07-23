import { NextRequest, NextResponse } from "next/server";

import {
  listPurchasingUsersForColumnAccess,
  loadOsfAccessCatalog,
  PURCHASING_OSF_TOOLS_PERMISSION_KEYS,
  sanitizeStoredColumnKeys,
} from "@/lib/osf/column-visibility";
import { allCatalogKeySet } from "@/lib/osf/column-access-catalog";
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

  const [users, marks, columns] = await Promise.all([
    listPurchasingUsersForColumnAccess(companyId),
    prisma.osfUserColumnAccess.findMany({
      where: { companyId },
      select: { userId: true, columnKeys: true },
    }),
    loadOsfAccessCatalog(companyId),
  ]);

  const marksByUser = new Map(marks.map((m) => [m.userId, m.columnKeys]));
  const catalogIds = allCatalogKeySet(columns);

  return NextResponse.json({
    columns,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      columnKeys: sanitizeStoredColumnKeys(marksByUser.get(u.id) ?? [], columns),
    })),
    catalogSize: catalogIds.size,
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

  const catalog = await loadOsfAccessCatalog(companyId);
  const catalogIds = allCatalogKeySet(catalog);

  const assignments =
    "assignments" in parsed.data ? parsed.data.assignments : [parsed.data];

  for (const a of assignments) {
    for (const key of a.columnKeys) {
      if (!catalogIds.has(key)) {
        return NextResponse.json(
          { error: `Unknown column access key: ${key}` },
          { status: 400 },
        );
      }
    }
  }

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
    assignments.map((a) => {
      const columnKeys = sanitizeStoredColumnKeys(a.columnKeys, catalog);
      return prisma.osfUserColumnAccess.upsert({
        where: { companyId_userId: { companyId, userId: a.userId } },
        create: {
          companyId,
          userId: a.userId,
          columnKeys,
        },
        update: { columnKeys },
        select: { userId: true, columnKeys: true },
      });
    }),
  );

  return NextResponse.json({
    users: updated.map((row) => ({
      userId: row.userId,
      columnKeys: sanitizeStoredColumnKeys(row.columnKeys, catalog),
    })),
    permissionKeys: PURCHASING_OSF_TOOLS_PERMISSION_KEYS,
  });
}
