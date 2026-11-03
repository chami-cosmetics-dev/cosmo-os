import {
  getCurrentUserContext,
  hasPermission,
} from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { BookNoteWriteAccess } from "@/lib/book-notes/lock";
import type { BookNoteLocationOption } from "@/lib/book-notes/types";

type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;

const LOCATION_SELECT = {
  id: true,
  name: true,
  shortName: true,
  erpnextCompany: true,
} as const;

export type BookNoteShopAccess = {
  /**
   * Finance (`book_notes.read`) and book-note admins (`book_notes.admin`)
   * may pick every company shop. Merchants are limited to assigned outlets.
   */
  canAccessAllShops: boolean;
  locations: BookNoteLocationOption[];
};

/**
 * Which saved book notes a user may *read back*.
 *
 * A merchant sees only the sheets they submitted — not a colleague's, even at
 * the same shop on the same day, because each merchant now keeps their own.
 * Finance (`book_notes.read`) and book-note admins (`book_notes.admin`) see
 * every sheet from every shop.
 */
export type BookNoteViewScope = {
  canViewAllShops: boolean;
};

export function canAccessEveryBookNoteShop(context: UserContext): boolean {
  return (
    hasPermission(context, "book_notes.read") ||
    hasPermission(context, "book_notes.admin")
  );
}

/**
 * Outlet ids this merchant may enter book notes for: employee location plus
 * shops where they are the default merchant. Company mismatch is ignored.
 */
export function collectAssignedBookNoteLocationIds(input: {
  companyId: string;
  profileLocationId: string | null | undefined;
  profileCompanyId: string | null | undefined;
  defaultMerchantLocationIds: string[];
}): string[] {
  const ids = new Set<string>();
  if (
    input.profileLocationId &&
    input.profileCompanyId === input.companyId
  ) {
    ids.add(input.profileLocationId);
  }
  for (const id of input.defaultMerchantLocationIds) {
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Shops the current user may enter / view book notes for.
 * Merchants: EmployeeProfile.location + default-merchant shops.
 * Finance / book-note admins: every company location.
 */
export async function resolveBookNoteShopAccess(
  context: UserContext,
  companyId: string,
): Promise<BookNoteShopAccess> {
  const canAccessAllShops = canAccessEveryBookNoteShop(context);
  if (canAccessAllShops) {
    const locations = await prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: LOCATION_SELECT,
    });
    return { canAccessAllShops: true, locations };
  }

  const userId = context.user?.id ?? null;
  if (!userId) {
    return { canAccessAllShops: false, locations: [] };
  }

  const [profile, defaultMerchantLocations] = await Promise.all([
    prisma.employeeProfile.findUnique({
      where: { userId },
      select: { locationId: true, companyId: true },
    }),
    prisma.companyLocation.findMany({
      where: { companyId, defaultMerchantUserId: userId },
      select: { id: true },
    }),
  ]);

  const allowedIds = collectAssignedBookNoteLocationIds({
    companyId,
    profileLocationId: profile?.locationId,
    profileCompanyId: profile?.companyId,
    defaultMerchantLocationIds: defaultMerchantLocations.map((l) => l.id),
  });
  if (allowedIds.length === 0) {
    return { canAccessAllShops: false, locations: [] };
  }

  const locations = await prisma.companyLocation.findMany({
    where: { companyId, id: { in: allowedIds } },
    orderBy: { name: "asc" },
    select: LOCATION_SELECT,
  });
  return { canAccessAllShops: false, locations };
}

/**
 * Read scope for the current user. Merchants get nothing beyond their own
 * sheets. Finance (`book_notes.read`) and book-note admins (`book_notes.admin`)
 * may open every sheet.
 */
export async function resolveBookNoteViewScope(
  context: UserContext,
): Promise<BookNoteViewScope> {
  return Promise.resolve({
    canViewAllShops: canAccessEveryBookNoteShop(context),
  });
}

/** True when this user is the merchant who first saved the sheet. */
export function isBookNoteCreator(
  userId: string | null,
  createdByUserId: string | null,
): boolean {
  return Boolean(userId && createdByUserId && userId === createdByUserId);
}

/**
 * May this user read (and therefore overwrite) an existing saved day?
 *
 * Merchants see the sheets they created — not a colleague's, even if they
 * later touched it. Finance (`book_notes.read`) and book-note admins
 * (`book_notes.admin`) see every sheet. Saving replaces every row, so anyone
 * who cannot see one must not be able to write it.
 */
export function canViewBookNoteDay(input: {
  viewScope: BookNoteViewScope;
  userId: string | null;
  day: {
    companyLocationId: string;
    createdByUserId: string | null;
    updatedByUserId?: string | null;
  };
}): boolean {
  if (input.viewScope.canViewAllShops) return true;
  return isBookNoteCreator(input.userId, input.day.createdByUserId);
}

export function resolveBookNoteWriteAccess(
  context: UserContext,
): BookNoteWriteAccess {
  const canAdminAll = hasPermission(context, "book_notes.admin");
  return {
    // TEMP: merchants with manage may pick past dates and edit/create old
    // sheets (own sheets only). Revert canBackdate to admin-only later.
    canBackdate:
      hasPermission(context, "book_notes.manage") || canAdminAll,
    canAdminAll,
  };
}

export function assertBookNoteShopAllowed(
  access: BookNoteShopAccess,
  companyLocationId: string,
): boolean {
  return access.locations.some((l) => l.id === companyLocationId);
}
