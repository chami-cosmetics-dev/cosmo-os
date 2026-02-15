import { auth0 } from "@/lib/auth0";
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
    ],
  },
  {
    name: "viewer",
    description: "Read-only access to user directory, staff, and roles",
    permissionKeys: ["users.read", "staff.read", "roles.read"],
  },
] as const;

type SessionUser = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
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
  if (!isRbacPrismaReady()) {
    return null;
  }

  await ensureDefaultRbacSetup();

  const user = await prisma.user.upsert({
    where: { auth0Id: sessionUser.sub },
    update: {
      email: sessionUser.email ?? null,
      name: sessionUser.name ?? null,
      picture: sessionUser.picture ?? null,
    },
    create: {
      auth0Id: sessionUser.sub,
      email: sessionUser.email ?? null,
      name: sessionUser.name ?? null,
      picture: sessionUser.picture ?? null,
    },
  });

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
  }

  return prisma.user.findUnique({
    where: { id: user.id },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getCurrentUserContext() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return null;
  }

  try {
    const user = await syncSessionUser({
      sub: session.user.sub,
      email: session.user.email ?? undefined,
      name: session.user.name ?? undefined,
      picture: session.user.picture ?? undefined,
    });

    if (!user) {
      return {
        sessionUser: session.user,
        user: null,
        permissionKeys: [],
        roleNames: [],
      };
    }

    const permissionKeys = Array.from(
      new Set(
        user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map(
            (rolePermission) => rolePermission.permission.key
          )
        )
      )
    );

    const roleNames = Array.from(new Set(user.userRoles.map((r) => r.role.name)));

    return {
      sessionUser: session.user,
      user,
      permissionKeys,
      roleNames,
    };
  } catch (error) {
    if (!isMissingRbacTableError(error)) {
      console.error("Failed to build RBAC context:", error);
    }
    return {
      sessionUser: session.user,
      user: null,
      permissionKeys: [],
      roleNames: [],
    };
  }
}

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

export async function requirePermission(permissionKey: string) {
  const context = await getCurrentUserContext();
  if (!context) {
    return { ok: false as const, status: 401, error: "Not authenticated" };
  }
  if (!context.user) {
    return {
      ok: false as const,
      status: 503,
      error: "RBAC database is not initialized",
    };
  }

  if (!hasPermission(context, permissionKey)) {
    return { ok: false as const, status: 403, error: "Permission denied" };
  }

  return { ok: true as const, context };
}

export async function listRbacData() {
  if (!isRbacPrismaReady()) {
    throw new Error(
      "RBAC Prisma client is not ready. Run: npm run db:push && npm run db:generate"
    );
  }

  await ensureDefaultRbacSetup();

  const [users, roles, permissions] = await Promise.all([
    prisma.user.findMany({
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
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
      orderBy: { key: "asc" },
    }),
  ]);

  return {
    users,
    roles,
    permissions,
  };
}

export function toSafeRoleName(input: string) {
  return normalizeRoleName(input);
}
