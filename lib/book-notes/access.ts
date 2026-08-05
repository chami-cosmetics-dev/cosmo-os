import {
  getCurrentUserContext,
} from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { BookNoteLocationOption } from "@/lib/book-notes/types";

type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;

const LOCATION_SELECT = {
  id: true,
  name: true,
  shortName: true,
  erpnextCompany: true,
} as const;

export type BookNoteShopAccess = {
  /** Admin / super_admin / book_notes.read — all company shops. */
  canAccessAllShops: boolean;
  locations: BookNoteLocationOption[];
};

function isBookNotesAdmin(context: UserContext): boolean {
  // roleNames may be inferred as never[] from empty-array return paths in getCurrentUserContext.
  const roles = context.roleNames as string[];
  return roles.includes("super_admin") || roles.includes("admin");
}

/**
 * Shops the current user may enter / view book notes for.
 * Merchants: EmployeeProfile.location (+ locations where they are defaultMerchant).
 * Admins / book_notes.read: all company locations.
 */
export async function resolveBookNoteShopAccess(
  context: UserContext,
  companyId: string,
): Promise<BookNoteShopAccess> {
  const canAccessAllShops = isBookNotesAdmin(context);

  if (canAccessAllShops) {
    const locations = await prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: LOCATION_SELECT,
    });
    return { canAccessAllShops: true, locations };
  }

  const userId = context.user?.id;
  if (!userId) {
    return { canAccessAllShops: false, locations: [] };
  }

  const [profile, defaultMerchantLocations] = await Promise.all([
    prisma.employeeProfile.findUnique({
      where: { userId },
      select: { locationId: true },
    }),
    prisma.companyLocation.findMany({
      where: { companyId, defaultMerchantUserId: userId },
      select: { id: true },
    }),
  ]);

  const allowedIds = new Set<string>();
  if (profile?.locationId) allowedIds.add(profile.locationId);
  for (const loc of defaultMerchantLocations) allowedIds.add(loc.id);

  if (allowedIds.size === 0) {
    return { canAccessAllShops: false, locations: [] };
  }

  const locations = await prisma.companyLocation.findMany({
    where: { companyId, id: { in: [...allowedIds] } },
    orderBy: { name: "asc" },
    select: LOCATION_SELECT,
  });

  return { canAccessAllShops: false, locations };
}

export function assertBookNoteShopAllowed(
  access: BookNoteShopAccess,
  companyLocationId: string,
): boolean {
  return access.locations.some((l) => l.id === companyLocationId);
}
