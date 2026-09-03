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
  /** Temporary: all company shops for every book-note user. Tighten to assignment later. */
  canAccessAllShops: boolean;
  locations: BookNoteLocationOption[];
};

/**
 * Shops the current user may enter / view book notes for.
 * Temporary: every company location. Later: EmployeeProfile.location + defaultMerchant only.
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
