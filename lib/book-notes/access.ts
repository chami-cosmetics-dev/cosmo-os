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
 * A merchant sees only the sheets they submitted — not a colleague's, even at
 * the same shop on the same day, because each merchant now keeps their own.
 * Finance (`book_notes.read`) sees every sheet from every shop.
 */
export type BookNoteViewScope = {
  canViewAllShops: boolean;
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
 * Read scope for the current user. Merchants get nothing beyond their own
 * sheets; only the finance/intern retrieve permission opens the whole company.
 * `book_notes.admin` is a *write* scope (backdating) and deliberately grants
 * no extra visibility.
 */
export async function resolveBookNoteViewScope(
  context: UserContext,
): Promise<BookNoteViewScope> {
  return Promise.resolve({
    canViewAllShops: hasPermission(context, "book_notes.read"),
  });
}

/**
 * May this user read (and therefore overwrite) an existing saved day?
 *
 * Their own sheets only, plus everything for finance. Saving replaces every
 * row of a sheet, so anyone who cannot see one must not be able to write it.
 */
export function canViewBookNoteDay(input: {
  viewScope: BookNoteViewScope;
  userId: string | null;
  day: {
    companyLocationId: string;
    createdByUserId: string | null;
    updatedByUserId: string | null;
  };
}): boolean {
  if (input.viewScope.canViewAllShops) return true;
  const { userId, day } = input;
  return Boolean(
    userId &&
      (day.createdByUserId === userId || day.updatedByUserId === userId),
  );
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
