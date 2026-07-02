import "server-only";
import { cache } from "react";
import { auth0 } from "@/lib/auth0";
import { isDatabaseUnavailableError } from "@/lib/dbObservability";
import { createPerfLogger } from "@/lib/perf";
import { prisma } from "@/lib/prisma";
import { REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";

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
    key: "seo.welcome",
    description: "View SEO team welcome page only",
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
    key: "academy.learn",
    description: "View Cosmo Academy lessons and update own learning progress",
  },
  {
    key: "academy.manage",
    description: "Create and manage Cosmo Academy product explanations",
  },
  // Products - Storage
  {
    key: "products.storage.read",
    description: "View product item file storage (photos, audio, video, documents)",
  },
  {
    key: "products.storage.manage",
    description: "Upload and delete files in product item storage",
  },
  // Contacts
  {
    key: "contacts.read",
    description: "Legacy broad contact access: view contact master, updates, allocation, and performance",
  },
  {
    key: "contacts.manage",
    description: "Legacy broad contact management: create, import, backfill, update, and allocate contacts",
  },
  {
    key: "contacts.master.read",
    description: "View Contact Master",
  },
  {
    key: "contacts.master.manage",
    description: "Create, import, backfill, and edit Contact Master records",
  },
  {
    key: "contacts.updates.read",
    description: "View Contact Updates",
  },
  {
    key: "contacts.updates.manage",
    description: "Update contacts and follow-up status from Contact Updates",
  },
  {
    key: "contacts.allocation.read",
    description: "View Contact Allocation",
  },
  {
    key: "contacts.allocation.manage",
    description: "Allocate contacts to assigned merchants",
  },
  {
    key: "contacts.allocation.settings",
    description: "Manage contact allocation option types in Settings",
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
    key: "orders.update_payment_method",
    description: "Change order payment method from COD to Bank Transfer",
  },
  {
    key: "orders.create_manual",
    description: "Create manual (non-Shopify) orders from the item master",
  },
  {
    key: "returns.read",
    description: "View returned order tracking",
  },
  {
    key: "returns.manage",
    description: "Update returned order tracking",
  },
  {
    key: "exchanges.read",
    description: "View exchange order tracking",
  },
  {
    key: "exchanges.manage",
    description: "Create and update exchange order tracking",
  },
  {
    key: "orders.view_timeline",
    description: "View order fulfillment timeline in modal",
  },
  {
    key: "failed_webhooks.read",
    description: "View failed Shopify order webhooks",
  },
  {
    key: "failed_webhooks.retry",
    description: "Retry failed Shopify order webhooks",
  },
  {
    key: "complaints.create",
    description: "Create merchant complaints",
  },
  {
    key: "complaints.read",
    description: "View merchant complaints",
  },
  {
    key: "complaints.manage",
    description: "Update complaint status and resolution",
  },
  {
    key: "finance.approvals.read",
    description: "View finance approval requests",
  },
  {
    key: "finance.approvals.manage",
    description: "Approve or reject finance approval requests",
  },
  {
    key: "finance.hod.revert_paid_to_unpaid",
    description: "Revert a paid order to unpaid (requires HOD password)",
  },
  // Reports - Dump downloads
  {
    key: REPORT_DUMP_PERMISSIONS.contactListPart1,
    description: "Download Dump 1 contact list part 1",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.contactListPart1_1,
    description: "Download Dump 1 contact list part 1_1",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.contactListPart2,
    description: "Download Dump 1 contact list part 2",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.contactListAll,
    description: "Download all contact dump records",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.invoice90,
    description: "Download Dump 2 invoice-wise last 90 days",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.invoiceItem90,
    description: "Download Dump 3 invoice item-wise last 90 days",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.utilityInvoice90,
    description: "Download Utility Dump 2 invoice-wise last 90 days",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.utilityInvoiceItem90,
    description: "Download Utility Dump 3 invoice item-wise last 90 days",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.contactLastPurchased,
    description: "Download Dump 4 contacts with last purchased date",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.contactLog,
    description: "Download Dump 5 contact log details",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.loyaltyCustomers,
    description: "Download loyalty customer list",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.warehouseInvoice,
    description: "Download warehouse invoice-wise 360 day dump",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.warehouseInvoiceItem,
    description: "Download warehouse invoice item-wise 360 day dump",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.historicalInvoice,
    description: "Download historical invoice details by year",
  },
  {
    key: REPORT_DUMP_PERMISSIONS.historicalInvoiceItem,
    description: "Download historical invoice item details by year",
  },
  {
    key: "settings.fulfillment",
    description: "Manage samples, free issues, hold reasons, and courier services",
  },
  // Dashboard
  {
    key: "dashboard.edit",
    description: "Edit dashboard brand configuration (add/remove brands, change selection)",
  },
  // Stickers
  {
    key: "stickers.batch.read",
    description: "View sticker batches",
  },
  {
    key: "stickers.batch.manage",
    description: "Create and edit sticker batches",
  },
  {
    key: "stickers.print.read",
    description: "View sticker print preview",
  },
  {
    key: "stickers.print.print",
    description: "Print stickers",
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
    description: "View delivery page",
  },
  {
    key: "fulfillment.delivery_invoice.mark_delivered",
    description: "Mark delivery complete",
  },
  {
    key: "fulfillment.delivery_invoice.mark_complete",
    description: "Mark invoice complete",
  },
  {
    key: "fulfillment.invoice_complete.read",
    description: "View invoice complete page",
  },
  // Fulfillment - Falcon Upload
  {
    key: "fulfillment.falcon_upload.read",
    description: "View Falcon upload page",
  },
  {
    key: "fulfillment.falcon_upload.export",
    description: "Generate Falcon upload files",
  },
  // Fulfillment - Waybill Lookup
  {
    key: "fulfillment.waybill_lookup.read",
    description: "Search order waybills by invoice number",
  },
  {
    key: "fulfillment.waybill_lookup.import",
    description: "Import and save order waybills from CSV",
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
  // Outlets
  {
    key: "outlets.manage",
    description: "Create, edit, and delete outlets; assign users to outlets",
  },
  {
    key: "outlets.read.all",
    description: "View and export outlet reviews for all outlets",
  },
  {
    key: "outlets.read.assigned",
    description: "View and edit outlet reviews for assigned outlets only",
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
      "academy.learn",
      "academy.manage",
      "products.storage.read",
      "products.storage.manage",
      "contacts.read",
      "contacts.manage",
      "contacts.master.read",
      "contacts.master.manage",
      "contacts.updates.read",
      "contacts.updates.manage",
      "contacts.allocation.read",
      "contacts.allocation.manage",
      "contacts.allocation.settings",
      "orders.read",
      "orders.manage",
      "orders.create_manual",
      "returns.read",
      "returns.manage",
      "exchanges.read",
      "exchanges.manage",
      "orders.view_timeline",
      "failed_webhooks.read",
      "failed_webhooks.retry",
      "complaints.create",
      "complaints.read",
      "complaints.manage",
      "finance.approvals.read",
      "finance.approvals.manage",
      "finance.hod.revert_paid_to_unpaid",
      REPORT_DUMP_PERMISSIONS.contactListPart1,
      REPORT_DUMP_PERMISSIONS.contactListPart1_1,
      REPORT_DUMP_PERMISSIONS.contactListPart2,
      REPORT_DUMP_PERMISSIONS.contactListAll,
      REPORT_DUMP_PERMISSIONS.invoice90,
      REPORT_DUMP_PERMISSIONS.invoiceItem90,
      REPORT_DUMP_PERMISSIONS.utilityInvoice90,
      REPORT_DUMP_PERMISSIONS.utilityInvoiceItem90,
      REPORT_DUMP_PERMISSIONS.contactLastPurchased,
      REPORT_DUMP_PERMISSIONS.contactLog,
      REPORT_DUMP_PERMISSIONS.loyaltyCustomers,
      REPORT_DUMP_PERMISSIONS.warehouseInvoice,
      REPORT_DUMP_PERMISSIONS.warehouseInvoiceItem,
      REPORT_DUMP_PERMISSIONS.historicalInvoice,
      REPORT_DUMP_PERMISSIONS.historicalInvoiceItem,
      "stickers.batch.read",
      "stickers.batch.manage",
      "stickers.print.read",
      "stickers.print.print",
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
      "fulfillment.invoice_complete.read",
      "fulfillment.falcon_upload.read",
      "fulfillment.falcon_upload.export",
      "fulfillment.waybill_lookup.read",
      "fulfillment.waybill_lookup.import",
      "fulfillment.remarks.manage",
      "fulfillment.revert_to.order_received",
      "fulfillment.revert_to.sample_free_issue",
      "fulfillment.revert_to.print",
      "fulfillment.revert_to.ready_dispatch",
      "fulfillment.revert_to.dispatched",
      "fulfillment.revert_to.delivery_complete",
      "outlets.manage",
      "outlets.read.all",
    ],
  },
  {
    name: "finance",
    description: "Can review and approve finance payment requests",
    permissionKeys: [
      "finance.approvals.read",
      "finance.approvals.manage",
      "fulfillment.invoice_complete.read",
      "fulfillment.delivery_invoice.mark_complete",
      "orders.read",
      "orders.update_payment_method",
      "returns.read",
    ],
  },
  {
    name: "hod",
    description: "Head of Department — can revert paid orders to unpaid with password",
    permissionKeys: [
      "finance.approvals.read",
      "finance.hod.revert_paid_to_unpaid",
      "orders.read",
    ],
  },
  {
    name: "viewer",
    description: "Read-only access to user directory, staff, and roles",
    permissionKeys: [
      "users.read",
      "staff.read",
      "roles.read",
      "contacts.read",
      "contacts.master.read",
      "contacts.updates.read",
      "contacts.allocation.read",
      "products.read",
      "academy.learn",
      "products.storage.read",
      "orders.read",
      "returns.read",
      "exchanges.read",
      "orders.view_timeline",
      "stickers.batch.read",
      "stickers.print.read",
      "fulfillment.sample_free_issue.read",
      "fulfillment.order_print.read",
      "fulfillment.ready_dispatch.read",
      "fulfillment.delivery_invoice.read",
      "fulfillment.falcon_upload.read",
      "fulfillment.waybill_lookup.read",
    ],
  },
  {
    name: "seo_team",
    description: "SEO team welcome-only access",
    permissionKeys: ["seo.welcome"],
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

    // Remove stale permissions no longer in DEFAULT_PERMISSIONS (cascades to RolePermission)
    const validKeys = DEFAULT_PERMISSIONS.map((p) => p.key);
    await prisma.permission.deleteMany({
      where: { key: { notIn: validKeys } },
    });
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
        companyId: true,
        company: options.isSuperAdmin
          ? { select: { id: true, name: true } }
          : false,
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
      where: { key: { in: DEFAULT_PERMISSIONS.map((p) => p.key) } },
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
