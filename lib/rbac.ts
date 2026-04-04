import "server-only";
import { cache } from "react";
import { auth0 } from "@/lib/auth0";
import { isDatabaseUnavailableError } from "@/lib/dbObservability";
import { createPerfLogger } from "@/lib/perf";
import { prisma } from "@/lib/prisma";

const DEFAULT_PERMISSIONS = [
  {
    key: "users.read",
    description: "View users and their roles",
  },
  {
    key: "users.manage",
    description: "Assign roles to users",
  },
  {
    key: "staff.read",
    description: "View staff list and employee profiles",
  },
  {
    key: "staff.manage",
    description: "Edit staff details and process resignations",
  },
  {
    key: "roles.read",
    description: "View roles and permissions",
  },
  {
    key: "roles.manage",
    description: "Create and delete roles",
  },
  {
    key: "settings.company",
    description: "View and edit company information",
  },
  {
    key: "settings.email_templates",
    description: "View and edit email notification templates",
  },
  {
    key: "settings.sms_portal",
    description: "View and edit SMS portal configuration",
  },
  {
    key: "products.read",
    description: "View product items, vendors, and categories",
  },
  {
    key: "products.manage",
    description: "Manage vendors and categories",
  },
  {
    key: "orders.read",
    description: "View received orders from Shopify",
  },
  {
    key: "orders.manage",
    description: "Retry failed order webhooks and manage order fulfillment",
  },
  {
    key: "orders.create_manual",
    description: "Create manual (non-Shopify) orders from the item master",
  },
  {
    key: "orders.view_timeline",
    description: "View order fulfillment timeline in modal",
  },
  {
    key: "settings.fulfillment",
    description: "Manage samples, free issues, hold reasons, and courier services",
  },
  // Fulfillment - Sample/Free Issue
  {
    key: "fulfillment.sample_free_issue.read",
    description: "View sample-free-issue page and add sample UI",
  },
  {
    key: "fulfillment.sample_free_issue.manage",
    description: "Add samples and advance to print",
  },
  {
    key: "fulfillment.sample_free_issue.manage_remarks",
    description: "Add/edit/delete remarks at sample stage",
  },
  // Fulfillment - Order Print
  {
    key: "fulfillment.order_print.read",
    description: "View print page and print count",
  },
  {
    key: "fulfillment.order_print.print",
    description: "Print invoice (increments print count)",
  },
  // Fulfillment - Ready & Dispatch
  {
    key: "fulfillment.ready_dispatch.read",
    description: "View ready & dispatch page",
  },
  {
    key: "fulfillment.ready_dispatch.put_on_hold",
    description: "Put package on hold",
  },
  {
    key: "fulfillment.ready_dispatch.package_ready",
    description: "Mark package ready",
  },
  {
    key: "fulfillment.ready_dispatch.revert_hold",
    description: "Revert hold",
  },
  {
    key: "fulfillment.ready_dispatch.dispatch",
    description: "Dispatch order (rider/courier)",
  },
  {
    key: "fulfillment.ready_dispatch.manage_remarks",
    description: "Add/edit/delete remarks at dispatch stage",
  },
  // Fulfillment - Delivery & Invoice
  {
    key: "fulfillment.delivery_invoice.read",
    description: "View delivery & invoice page",
  },
  {
    key: "fulfillment.delivery_invoice.mark_delivered",
    description: "Mark delivery complete",
  },
  {
    key: "fulfillment.delivery_invoice.mark_complete",
    description: "Mark invoice complete",
  },
  // Fulfillment - Remarks (all stages)
  {
    key: "fulfillment.remarks.manage",
    description: "Add/edit/delete order remarks",
  },
  // Fulfillment - Revert to stage (per-stage, cascading)
  {
    key: "fulfillment.revert_to.order_received",
    description: "Revert order to Order Received",
  },
  {
    key: "fulfillment.revert_to.sample_free_issue",
    description: "Revert order to Sample/Free Issue",
  },
  {
    key: "fulfillment.revert_to.print",
    description: "Revert order to Print",
  },
  {
    key: "fulfillment.revert_to.ready_dispatch",
    description: "Revert order to Ready to Dispatch",
  },
  {
    key: "fulfillment.revert_to.dispatched",
    description: "Revert order to Dispatched",
  },
  {
    key: "fulfillment.revert_to.delivery_complete",
    description: "Revert order to Delivery Complete",
  },
] as const;

const DEFAULT_ROLES = [
  {
    name: "super_admin",
    description: "Full system access including company setup",
    permissionKeys: DEFAULT_PERMISSIONS.map((p) => p.key),
  },
  {
    name: "admin",
    description: "Full access to user and role management",
    permissionKeys: DEFAULT_PERMISSIONS.map((p) => p.key),
  },
  {
    name: "manager",
    description: "Can view and assign users to roles, manage staff",
    permissionKeys: [
      "users.read",
      "users.manage",
      "staff.read",
      "staff.manage",
      "roles.read",
      "settings.company",
      "settings.email_templates",
      "settings.sms_portal",
      "settings.fulfillment",
      "products.read",
      "products.manage",
      "orders.read",
      "orders.manage",
      "orders.create_manual",
      "orders.view_timeline",
      "fulfillment.sample_free_issue.read",
      "fulfillment.sample_free_issue.manage",
      "fulfillment.sample_free_issue.manage_remarks",
      "fulfillment.order_print.read",
      "fulfillment.order_print.print",
      "fulfillment.ready_dispatch.read",
      "fulfillment.ready_dispatch.put_on_hold",
      "fulfillment.ready_dispatch.package_ready",
      "fulfillment.ready_dispatch.revert_hold",
      "fulfillment.ready_dispatch.dispatch",
      "fulfillment.ready_dispatch.manage_remarks",
      "fulfillment.delivery_invoice.read",
      "fulfillment.delivery_invoice.mark_delivered",
      "fulfillment.delivery_invoice.mark_complete",
      "fulfillment.remarks.manage",
      "fulfillment.revert_to.order_received",
      "fulfillment.revert_to.sample_free_issue",
      "fulfillment.revert_to.print",
      "fulfillment.revert_to.ready_dispatch",
      "fulfillment.revert_to.dispatched",
      "fulfillment.revert_to.delivery_complete",
    ],
  },
  {
    name: "viewer",
    description: "Read-only access to user directory, staff, and roles",
    permissionKeys: [
      "users.read",
      "staff.read",
      "roles.read",
      "products.read",
      "orders.read",
      "orders.view_timeline",
      "fulfillment.sample_free_issue.read",
      "fulfillment.order_print.read",
      "fulfillment.ready_dispatch.read",
      "fulfillment.delivery_invoice.read",
    ],
  },
] as const;

type SessionUser = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

type AccessRole = {
  id: string;
  name: string;
};

function isPrismaKnownError(error: unknown): error is { code?: string; message?: string } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: string }).code === "string"
  );
}

function isMissingRbacTableError(error: unknown) {
  if (!isPrismaKnownError(error)) {
    return false;
  }
  return error.code === "P2021";
}

function isUniqueConstraintError(error: unknown) {
  if (!isPrismaKnownError(error)) {
    return false;
  }
  return error.code === "P2002";
}

function isRbacPrismaReady() {
  const client = prisma as unknown as Record<string, unknown>;
  return Boolean(
    client.permission &&
      client.role &&
      client.user &&
      client.userRole &&
      client.rolePermission
  );
}

function normalizeRoleName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_\s]/g, "")
    .replace(/\s+/g, "-");
}

/** Cached promise so setup runs only once per process. */
let rbacSetupPromise: Promise<void> | null = null;
let hasVerifiedDefaultRbacSetup = false;
let rbacDatabaseUnavailableUntil = 0;

const EXPECTED_PERMISSION_COUNT = DEFAULT_PERMISSIONS.length;
const RBAC_DB_RETRY_MS = Number(process.env.RBAC_DB_RETRY_MS ?? "15000");

function isRbacDatabaseTemporarilyUnavailable() {
  return Date.now() < rbacDatabaseUnavailableUntil;
}

function markRbacDatabaseUnavailable() {
  rbacDatabaseUnavailableUntil = Date.now() + RBAC_DB_RETRY_MS;
}

/**
 * Ensures RBAC setup runs when needed. Uses a fast DB count check so we skip the
 * full setup when permissions are already populated. This works across Next.js
 * dev workers (each has its own process-level cache).
 */
async function ensureDefaultRbacSetupIfNeeded() {
  if (hasVerifiedDefaultRbacSetup || isRbacDatabaseTemporarilyUnavailable()) {
    return;
  }

  if (!rbacSetupPromise) {
    rbacSetupPromise = (async () => {
      try {
        const count = await prisma.permission.count();
        if (count < EXPECTED_PERMISSION_COUNT) {
          await ensureDefaultRbacSetup();
        }
        hasVerifiedDefaultRbacSetup = true;
      } catch (error) {
        if (isDatabaseUnavailableError(error)) {
          markRbacDatabaseUnavailable();
        }
        throw error;
      }
    })().finally(() => {
      rbacSetupPromise = null;
    });
  }

  await rbacSetupPromise;
}

export async function ensureDefaultRbacSetup() {
  if (!isRbacPrismaReady()) {
    throw new Error(
      "RBAC Prisma client is not ready. Run: npm run db:push && npm run db:generate"
    );
  }

  try {
    for (const permission of DEFAULT_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: { description: permission.description },
        create: {
          key: permission.key,
          description: permission.description,
        },
      });
    }

    for (const role of DEFAULT_ROLES) {
      const dbRole = await prisma.role.upsert({
        where: { name: role.name },
        update: { description: role.description },
        create: {
          name: role.name,
          description: role.description,
        },
      });

      const permissions = await prisma.permission.findMany({
        where: { key: { in: role.permissionKeys as string[] } },
        select: { id: true },
      });

      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: dbRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    if (isMissingRbacTableError(error)) {
      throw new Error(
        "RBAC tables are missing. Run: npm run db:push && npm run db:generate"
      );
    }
    throw error;
  }
}

export async function syncSessionUser(sessionUser: SessionUser) {
  if (!sessionUser.sub) {
    return null;
  }
  if (!isRbacPrismaReady() || isRbacDatabaseTemporarilyUnavailable()) {
    return null;
  }

  await ensureDefaultRbacSetupIfNeeded();

  const normalizedEmail = sessionUser.email?.trim().toLowerCase() ?? null;
  const existingUserByAuth0Id = await prisma.user.findUnique({
    where: { auth0Id: sessionUser.sub },
  });

  const existingUserByEmail = normalizedEmail && !existingUserByAuth0Id
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })
    : null;

  const existingUser = existingUserByAuth0Id ?? existingUserByEmail ?? null;
  let user;

  const needsUpdate =
    existingUser &&
    (existingUser.auth0Id !== sessionUser.sub ||
      existingUser.email !== normalizedEmail ||
      existingUser.name !== (sessionUser.name ?? null) ||
      existingUser.picture !== (sessionUser.picture ?? null));

  try {
    if (existingUser && !needsUpdate) {
      user = existingUser;
    } else if (existingUser && needsUpdate) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          auth0Id: sessionUser.sub,
          email: normalizedEmail,
          name: sessionUser.name ?? null,
          picture: sessionUser.picture ?? null,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          auth0Id: sessionUser.sub,
          email: normalizedEmail,
          name: sessionUser.name ?? null,
          picture: sessionUser.picture ?? null,
        },
      });
    }
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const conflictingUser =
      (await prisma.user.findUnique({
        where: { auth0Id: sessionUser.sub },
        select: { id: true },
      })) ??
      (normalizedEmail
        ? await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          })
        : null);

    if (!conflictingUser) {
      throw error;
    }

    user = await prisma.user.update({
      where: { id: conflictingUser.id },
      data: {
        auth0Id: sessionUser.sub,
        email: normalizedEmail,
        name: sessionUser.name ?? null,
        picture: sessionUser.picture ?? null,
      },
    });
  }

  const userWithRoles = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      userRoles: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!userWithRoles) return null;

  // Only run first-user logic when user has no roles (avoids count on every request)
  if (userWithRoles.userRoles.length === 0) {
    const totalUsers = await prisma.user.count();
    if (totalUsers === 1) {
      const superAdminRole = await prisma.role.findUnique({
        where: { name: "super_admin" },
        select: { id: true },
      });
      if (superAdminRole) {
        await prisma.userRole.createMany({
          data: [{ userId: user.id, roleId: superAdminRole.id }],
          skipDuplicates: true,
        });
      }
      return prisma.user.findUnique({
        where: { id: user.id },
      });
    }
  }

  return user;
}

type SessionLike = { user: { sub?: string; email?: string; name?: string; picture?: string } };

async function buildContextFromSessionUser(sessionUser: SessionUser) {
  const user = await syncSessionUser({
    sub: sessionUser.sub,
    email: sessionUser.email ?? undefined,
    name: sessionUser.name ?? undefined,
    picture: sessionUser.picture ?? undefined,
  });

  if (!user) {
    return {
      sessionUser,
      user: null,
      permissionKeys: [],
      roleNames: [],
    };
  }

  const userAccess = await getUserAccessRoles(user.id);
  const roles: AccessRole[] = (userAccess?.userRoles ?? []).map((userRole) => userRole.role);
  const roleNames = Array.from(new Set(roles.map((role) => role.name)));
  const permissionKeys = await getRolePermissionKeys(roles.map((role) => role.id));

  return {
    sessionUser,
    user,
    permissionKeys,
    roleNames,
  };
}

async function getCurrentUserContextImpl(session?: SessionLike | null) {
  const sess = session ?? (await auth0.getSession());
  if (!sess?.user) {
    return null;
  }

  try {
    return await buildContextFromSessionUser(sess.user);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      markRbacDatabaseUnavailable();
    } else {
      console.error("Failed to build RBAC context:", error);
    }
    return {
      sessionUser: sess.user,
      user: null,
      permissionKeys: [],
      roleNames: [],
    };
  }
}

/** TTL cache for parallel API requests from same user (e.g. settings page fetches 5 APIs at once). */
const USER_CONTEXT_TTL_MS = 2000;
const ROLE_PERMISSION_TTL_MS = 30000;
const userContextCache = new Map<
  string,
  {
    result: Awaited<ReturnType<typeof getCurrentUserContextImpl>>;
    timestamp: number;
  }
>();
const rolePermissionCache = new Map<
  string,
  {
    permissionKeys: string[];
    timestamp: number;
  }
>();

async function getUserAccessRoles(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      userRoles: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
}

async function getRolePermissionKeys(roleIds: string[]) {
  if (roleIds.length === 0) {
    return [];
  }

  const cacheKey = [...roleIds].sort().join(",");
  const cached = rolePermissionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp <= ROLE_PERMISSION_TTL_MS) {
    return cached.permissionKeys;
  }

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    select: {
      permission: {
        select: {
          key: true,
        },
      },
    },
  });

  const permissionKeys = Array.from(
    new Set(rolePermissions.map((rolePermission) => rolePermission.permission.key))
  );

  rolePermissionCache.set(cacheKey, {
    permissionKeys,
    timestamp: Date.now(),
  });

  return permissionKeys;
}

function getCachedUserContext(
  sub: string
): Awaited<ReturnType<typeof getCurrentUserContextImpl>> | undefined {
  const entry = userContextCache.get(sub);
  if (!entry || Date.now() - entry.timestamp > USER_CONTEXT_TTL_MS) {
    if (entry) userContextCache.delete(sub);
    return undefined;
  }
  return entry.result;
}

function setCachedUserContext(
  sub: string,
  result: Awaited<ReturnType<typeof getCurrentUserContextImpl>>
) {
  const now = Date.now();
  for (const [k, v] of userContextCache.entries()) {
    if (now - v.timestamp > USER_CONTEXT_TTL_MS) userContextCache.delete(k);
  }
  userContextCache.set(sub, { result, timestamp: now });
}

async function getCurrentUserContextCached() {
  const session = await auth0.getSession();
  if (!session?.user?.sub) {
    return null;
  }
  const cached = getCachedUserContext(session.user.sub);
  if (cached !== undefined) {
    return cached;
  }
  const result = await getCurrentUserContextImpl(session);
  setCachedUserContext(session.user.sub, result);
  return result;
}

/** Cached per-request to avoid duplicate auth/sync when layout and page both need context. */
export const getCurrentUserContext = cache(getCurrentUserContextCached);

export function hasPermission(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>,
  permissionKey: string
) {
  if (!context) {
    return false;
  }
  const roleNames = context.roleNames as string[];
  if (roleNames.includes("super_admin") || roleNames.includes("admin")) {
    return true;
  }
  return (context.permissionKeys as string[]).includes(permissionKey);
}

export function hasAnyPermission(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>,
  permissionKeys: string[]
) {
  return permissionKeys.some((key) => hasPermission(context, key));
}

export async function requirePermission(permissionKey: string) {
  const perf = createPerfLogger("rbac.requirePermission", { permissionKey });
  let context = await getCurrentUserContext();
  perf.mark("get-context");
  if (!context) {
    perf.end({ status: 401, ok: false });
    return { ok: false as const, status: 401, error: "Not authenticated" };
  }
  if (!context.user) {
    try {
      context = await buildContextFromSessionUser(context.sessionUser);
    } catch (error) {
      console.error("Failed RBAC retry in requirePermission:", error);
    }
  }
  if (!context.user) {
    perf.end({ status: 503, ok: false });
    return {
      ok: false as const,
      status: 503,
      error: "RBAC database is not initialized",
    };
  }

  if (!hasPermission(context, permissionKey)) {
    perf.end({ status: 403, ok: false });
    return { ok: false as const, status: 403, error: "Permission denied" };
  }

  perf.end({ status: 200, ok: true });
  return { ok: true as const, context };
}

/** Requires user to have at least one of the given permissions. */
export async function requireAnyPermission(permissionKeys: string[]) {
  let context = await getCurrentUserContext();
  if (!context) {
    return { ok: false as const, status: 401, error: "Not authenticated" };
  }
  if (!context.user) {
    try {
      context = await buildContextFromSessionUser(context.sessionUser);
    } catch (error) {
      console.error("Failed RBAC retry in requireAnyPermission:", error);
    }
  }
  if (!context.user) {
    return {
      ok: false as const,
      status: 503,
      error: "RBAC database is not initialized",
    };
  }

  const hasAny = permissionKeys.some((key) => hasPermission(context, key));
  if (!hasAny) {
    return { ok: false as const, status: 403, error: "Permission denied" };
  }

  return { ok: true as const, context };
}

type ListRbacDataOptions = {
  companyId?: string | null;
  isSuperAdmin?: boolean;
};

export async function listRbacData(options: ListRbacDataOptions = {}) {
  if (!isRbacPrismaReady()) {
    throw new Error(
      "RBAC Prisma client is not ready. Run: npm run db:push && npm run db:generate"
    );
  }

  await ensureDefaultRbacSetupIfNeeded();

  const userWhere =
    options.isSuperAdmin || !options.companyId
      ? undefined
      : { companyId: options.companyId };

  const [users, rawRoles, permissions] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        auth0Id: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        rolePermissions: {
          select: {
            permissionId: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.permission.findMany({
      select: {
        id: true,
        key: true,
        description: true,
      },
      orderBy: { key: "asc" },
    }),
  ]);

  const permissionsById = new Map(permissions.map((permission) => [permission.id, permission]));
  const roles = rawRoles.map((role) => ({
    ...role,
    rolePermissions: role.rolePermissions
      .map((rolePermission) => {
        const permission = permissionsById.get(rolePermission.permissionId);
        return permission ? { permission } : null;
      })
      .filter((rolePermission): rolePermission is { permission: (typeof permissions)[number] } =>
        rolePermission !== null
      ),
  }));

  return {
    users,
    roles,
    permissions,
  };
}

export function toSafeRoleName(input: string) {
  return normalizeRoleName(input);
}
