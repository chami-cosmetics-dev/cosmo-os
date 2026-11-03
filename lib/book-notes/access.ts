import {
  getCurrentUserContext,
  hasPermission,
} from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { BookNoteWriteAccess } from "@/lib/book-notes/lock";
import type { BookNoteLocationOption } from "@/lib/book-notes/types";
import {
  collectBookNoteCosmeticsPosScope,
  collectBookNoteTradingShortNames,
  isCosmeticsBookNoteLocation,
  type BookNoteCosmeticsPosScope,
} from "@/lib/book-notes/shop-outlet-map";

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
  /**
   * When set, Cosmetics.lk order typeahead / save is limited to these POS
   * profiles / warehouses. `null` means no POS filter (finance, or Cosmetics
   * warehouse staff assigned directly to Cosmetics without a floor map).
   */
  cosmeticsPosScope: BookNoteCosmeticsPosScope | null;
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
 * Outlet ids this merchant may enter book notes for: employee location,
 * default-merchant shops, and trading companies mapped from their floor outlet.
 */
export function collectAssignedBookNoteLocationIds(input: {
  companyId: string;
  profileLocationId: string | null | undefined;
  profileCompanyId: string | null | undefined;
  defaultMerchantLocationIds: string[];
  mappedLocationIds: string[];
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
  for (const id of input.mappedLocationIds) {
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Shops the current user may enter / view book notes for.
 * Merchants: employee location + default-merchant + outlet→company map
 * (trading shop + Cosmetics.lk when that floor has a POS).
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
    return { canAccessAllShops: true, locations, cosmeticsPosScope: null };
  }

  const userId = context.user?.id ?? null;
  if (!userId) {
    return {
      canAccessAllShops: false,
      locations: [],
      cosmeticsPosScope: null,
    };
  }

  const [profile, defaultMerchantLocations, allLocations] = await Promise.all([
    prisma.employeeProfile.findUnique({
      where: { userId },
      select: {
        locationId: true,
        companyId: true,
        outlet: { select: { name: true } },
        location: { select: { shortName: true, erpnextCompany: true, name: true } },
      },
    }),
    prisma.companyLocation.findMany({
      where: { companyId, defaultMerchantUserId: userId },
      select: { id: true },
    }),
    prisma.companyLocation.findMany({
      where: { companyId },
      select: LOCATION_SELECT,
    }),
  ]);

  const outletName = profile?.outlet?.name ?? null;
  const profileShortName = profile?.location?.shortName ?? null;
  const tradingShortNames = collectBookNoteTradingShortNames({
    outletName,
    locationShortNames: profileShortName ? [profileShortName] : [],
  });
  const cosmeticsPosScope = collectBookNoteCosmeticsPosScope({
    outletName,
    locationShortNames: profileShortName ? [profileShortName] : [],
  });

  const mappedLocationIds: string[] = [];
  for (const loc of allLocations) {
    const short = (loc.shortName ?? "").trim();
    if (short && tradingShortNames.includes(short)) {
      mappedLocationIds.push(loc.id);
    }
  }

  const wantsCosmetics =
    cosmeticsPosScope != null ||
    (profile?.location != null &&
      isCosmeticsBookNoteLocation(profile.location));
  if (wantsCosmetics) {
    for (const loc of allLocations) {
      if (isCosmeticsBookNoteLocation(loc)) mappedLocationIds.push(loc.id);
    }
  }

  const allowedIds = collectAssignedBookNoteLocationIds({
    companyId,
    profileLocationId: profile?.locationId,
    profileCompanyId: profile?.companyId,
    defaultMerchantLocationIds: defaultMerchantLocations.map((l) => l.id),
    mappedLocationIds,
  });
  if (allowedIds.length === 0) {
    return {
      canAccessAllShops: false,
      locations: [],
      cosmeticsPosScope: null,
    };
  }

  const locations = allLocations
    .filter((l) => allowedIds.includes(l.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    canAccessAllShops: false,
    locations,
    cosmeticsPosScope,
  };
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
