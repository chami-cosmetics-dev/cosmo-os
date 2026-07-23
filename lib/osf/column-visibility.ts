import "server-only";

import {
  allCatalogKeySet,
  buildOsfAccessCatalog,
  normalizeOsfColumnKeys,
  resolveEffectiveOsfColumnKeysFromMarks,
  type OsfAccessColumnMeta,
} from "@/lib/osf/column-access-catalog";
import { resolveOsfColumns } from "@/lib/osf/column-config";
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

export async function loadOsfAccessCatalog(companyId: string): Promise<OsfAccessColumnMeta[]> {
  const columns = await resolveOsfColumns(companyId);
  return buildOsfAccessCatalog(columns);
}

export { resolveEffectiveOsfColumnKeysFromMarks };

export async function resolveEffectiveOsfColumnKeys(
  context: RbacContext | null | undefined,
  companyId: string,
): Promise<Set<string> | "all"> {
  const catalog = await loadOsfAccessCatalog(companyId);
  const catalogIds = allCatalogKeySet(catalog);
  const fullAccess = hasFullOsfColumnAccess(context);
  if (fullAccess) return "all";

  const userId = context?.user?.id;
  if (!userId) return new Set();

  const row = await prisma.osfUserColumnAccess.findUnique({
    where: { companyId_userId: { companyId, userId } },
    select: { columnKeys: true },
  });

  return resolveEffectiveOsfColumnKeysFromMarks(row?.columnKeys, false, catalogIds);
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

export function sanitizeStoredColumnKeys(
  keys: string[] | null | undefined,
  catalog: OsfAccessColumnMeta[],
): string[] {
  return normalizeOsfColumnKeys(keys, allCatalogKeySet(catalog));
}
