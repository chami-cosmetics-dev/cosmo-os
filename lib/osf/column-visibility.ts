import "server-only";

import {
  ALL_OSF_COLUMN_GROUPS,
  columnGroupSet,
  normalizeOptionalColumnGroups,
  type OsfColumnGroupId,
} from "@/lib/osf/column-groups";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

type RbacContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;

export const PURCHASING_OSF_TOOLS_PERMISSION_KEYS = [
  "purchasing.osf.read",
  "purchasing.osf.manage",
  "purchasing.osf.permission",
  "purchasing.tools.read",
  "purchasing.tools.manage",
] as const;

export function hasFullOsfColumnAccess(context: RbacContext | null | undefined): boolean {
  return (
    hasPermission(context ?? null, "purchasing.osf.manage") ||
    hasPermission(context ?? null, "purchasing.osf.permission")
  );
}

export function resolveEffectiveOsfColumnGroupsFromMarks(
  marks: string[] | null | undefined,
  fullAccess: boolean,
): Set<OsfColumnGroupId> {
  if (fullAccess) return columnGroupSet(ALL_OSF_COLUMN_GROUPS);
  return columnGroupSet([
    "core",
    ...normalizeOptionalColumnGroups(marks ?? []),
  ]);
}

export async function resolveEffectiveOsfColumnGroups(
  context: RbacContext | null | undefined,
  companyId: string,
): Promise<Set<OsfColumnGroupId>> {
  const fullAccess = hasFullOsfColumnAccess(context);
  if (fullAccess) return columnGroupSet(ALL_OSF_COLUMN_GROUPS);

  const userId = context?.user?.id;
  if (!userId) return columnGroupSet(["core"]);

  const row = await prisma.osfUserColumnAccess.findUnique({
    where: { companyId_userId: { companyId, userId } },
    select: { columnGroups: true },
  });

  return resolveEffectiveOsfColumnGroupsFromMarks(row?.columnGroups, false);
}

export async function listPurchasingUsersForColumnAccess(companyId: string) {
  const perms = await prisma.permission.findMany({
    where: { key: { in: [...PURCHASING_OSF_TOOLS_PERMISSION_KEYS] } },
    select: { id: true },
  });
  if (!perms.length) return [];

  const roleLinks = await prisma.rolePermission.findMany({
    where: { permissionId: { in: perms.map((p) => p.id) } },
    select: { roleId: true },
  });
  const roleIds = [...new Set(roleLinks.map((r) => r.roleId))];
  if (!roleIds.length) return [];

  const userRoles = await prisma.userRole.findMany({
    where: {
      roleId: { in: roleIds },
      user: { companyId },
    },
    select: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const byId = new Map<
    string,
    { id: string; name: string | null; email: string | null }
  >();
  for (const ur of userRoles) {
    byId.set(ur.user.id, ur.user);
  }

  return [...byId.values()].sort((a, b) =>
    (a.name ?? a.email ?? a.id).localeCompare(b.name ?? b.email ?? b.id),
  );
}
