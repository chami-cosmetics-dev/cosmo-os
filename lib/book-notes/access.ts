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
  /** Every user may still *enter* a book note against any company shop. */
  canAccessAllShops: boolean;
  locations: BookNoteLocationOption[];
};

/**
 * Which saved book notes a user may *read back*.
 *
 * Entry is deliberately unrestricted (a merchant covering another shop still
 * needs to key its book), but history is outlet-scoped: two merchants in the
 * same outlet see each other's sheets, a merchant in another outlet does not.
 * Finance / admin (`book_notes.read` or `book_notes.admin`) see everything.
 */
export type BookNoteViewScope = {
  canViewAllShops: boolean;
  /** Shops this user is posted to (employee location + default merchant). */
  assignedLocationIds: string[];
};

/**
 * Shops the current user may enter / view book notes for.
 * Every company location — visibility is narrowed by `resolveBookNoteViewScope`.
 */
export async function resolveBookNoteShopAccess(
  _context: UserContext,
  companyId: string,
): Promise<BookNoteShopAccess> {
  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: LOCATION_SELECT,
  });
  return { canAccessAllShops: true, locations };
}

/**
 * Outlets whose saved book notes this user may see, plus the finance/admin
 * override. A user always also sees sheets they created or last saved
 * themselves, which `loadBookNoteHistory` adds on top of these ids.
 */
export async function resolveBookNoteViewScope(
  context: UserContext,
  companyId: string,
): Promise<BookNoteViewScope> {
  const canViewAllShops =
    hasPermission(context, "book_notes.read") ||
    hasPermission(context, "book_notes.admin");

  const userId = context.user?.id ?? null;
  if (canViewAllShops || !userId) {
    return { canViewAllShops, assignedLocationIds: [] };
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

  const ids = new Set<string>();
  if (profile?.locationId && profile.companyId === companyId) {
    ids.add(profile.locationId);
  }
  for (const loc of defaultMerchantLocations) {
    ids.add(loc.id);
  }

  return { canViewAllShops: false, assignedLocationIds: [...ids] };
}

export function resolveBookNoteWriteAccess(
  context: UserContext,
): BookNoteWriteAccess {
  return {
    canBackdate: hasPermission(context, "book_notes.admin"),
  };
}

export function assertBookNoteShopAllowed(
  access: BookNoteShopAccess,
  companyLocationId: string,
): boolean {
  return access.locations.some((l) => l.id === companyLocationId);
}
