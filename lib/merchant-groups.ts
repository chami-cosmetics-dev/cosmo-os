import { prisma } from "@/lib/prisma";
import {
  DM_GENERAL_DISPLAY_NAME,
  isDmCouponCode,
  isMerchantTrackingCode,
  normalizeDashboardMerchantLabel,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";

type MerchantUser = {
  id: string;
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  couponCodes: string[];
};

export type MerchantOption = MerchantUser & {
  displayName: string;
  groupId: string | null;
  groupName: string | null;
};

export type MerchantGroupWithMembers = {
  id: string;
  name: string;
  members: MerchantOption[];
};

type MerchantGroupModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown | null>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

type MerchantGroupMemberModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
  create: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
};

function getMerchantGroupModel(): MerchantGroupModel | null {
  return (prisma as unknown as { merchantGroup?: MerchantGroupModel }).merchantGroup ?? null;
}

function getMerchantGroupMemberModel(): MerchantGroupMemberModel | null {
  return (prisma as unknown as { merchantGroupMember?: MerchantGroupMemberModel }).merchantGroupMember ?? null;
}

export function supportsMerchantGroups(): boolean {
  return !!getMerchantGroupModel() && !!getMerchantGroupMemberModel();
}

export function getMerchantDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  id?: string | null;
} | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || user?.id?.trim() || "Unknown";
}

export async function getMerchantGroupUserMap(companyId: string): Promise<Map<string, { id: string; name: string }>> {
  const groupModel = getMerchantGroupModel();
  if (!groupModel) return new Map();

  try {
    const rows = (await groupModel.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        members: { select: { userId: true } },
      },
    })) as Array<{ id: string; name: string; members: Array<{ userId: string }> }>;

    const userToGroup = new Map<string, { id: string; name: string }>();
    for (const group of rows) {
      for (const member of group.members) {
        userToGroup.set(member.userId, { id: group.id, name: group.name });
      }
    }
    return userToGroup;
  } catch {
    return new Map();
  }
}

export function applyMerchantGroup(
  merchant: { id: string | null; name: string },
  userToGroup: Map<string, { id: string; name: string }>,
) {
  if (!merchant.id) {
    return {
      id: merchant.id,
      name: normalizeDashboardMerchantLabel(merchant.name),
    };
  }
  const group = userToGroup.get(merchant.id);
  if (group) {
    return {
      id: group.id,
      name: normalizeDashboardMerchantLabel(group.name),
    };
  }
  return {
    id: merchant.id,
    name: normalizeDashboardMerchantLabel(merchant.name),
  };
}

export function buildCouponToMerchantMap(
  users: MerchantUser[],
  userToGroup: Map<string, { id: string; name: string }> = new Map(),
) {
  const couponToMerchant = new Map<string, { id: string | null; name: string }>();
  for (const user of users) {
    const merchant = applyMerchantGroup(
      {
        id: user.id,
        name: normalizeDashboardMerchantLabel(getMerchantDisplayName(user)),
      },
      userToGroup,
    );
    merchant.name = normalizeDashboardMerchantLabel(merchant.name);
    for (const coupon of user.couponCodes) {
      const normalized = coupon.trim().toLowerCase();
      if (!normalized) continue;
      // DM codes always bucket to DM-General — never the staff who also holds them.
      if (isDmCouponCode(coupon)) {
        couponToMerchant.set(normalized, {
          id: null,
          name: DM_GENERAL_DISPLAY_NAME,
        });
        continue;
      }
      if (!couponToMerchant.has(normalized)) {
        couponToMerchant.set(normalized, merchant);
      }
    }
  }
  return couponToMerchant;
}

/** Prefer personal MER match over DM-General when an order lists both. */
export function matchMerchantFromCouponMap(
  merchantCoupons: string[],
  couponToMerchant: Map<string, { id: string | null; name: string }>,
): { id: string | null; name: string } | null {
  let dmMatch: { id: string | null; name: string } | null = null;
  for (const code of merchantCoupons) {
    const hit = couponToMerchant.get(code.trim().toLowerCase());
    if (!hit) continue;
    const name = normalizeDashboardMerchantLabel(hit.name);
    if (name === DM_GENERAL_DISPLAY_NAME) {
      dmMatch ??= { id: null, name: DM_GENERAL_DISPLAY_NAME };
      continue;
    }
    return { id: hit.id, name };
  }
  return dmMatch;
}

/**
 * When no coupon mapped: DM-holder assignees without a personal MER on the order
 * go to DM-General so their name row stays MER-only.
 */
export function resolveAssignedMerchantDashboardFallback(input: {
  assignedMerchantId: string | null | undefined;
  assignedMerchant: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  } | null;
  orderCoupons: string[];
  userToGroup: Map<string, { id: string; name: string }>;
}): { id: string | null; name: string } {
  const sets = splitMerchantCouponSets(input.assignedMerchant?.couponCodes);
  const tracking = input.orderCoupons
    .map((c) => c.trim().toLowerCase())
    .filter((c) => isMerchantTrackingCode(c));
  const personalHit = tracking.some((c) => sets.personal.has(c));
  if (sets.hasDm && !personalHit) {
    return { id: null, name: DM_GENERAL_DISPLAY_NAME };
  }
  const grouped = applyMerchantGroup(
    {
      id: input.assignedMerchantId ?? null,
      name: normalizeDashboardMerchantLabel(
        getMerchantDisplayName(input.assignedMerchant),
      ),
    },
    input.userToGroup,
  );
  return {
    id: grouped.id,
    name: normalizeDashboardMerchantLabel(grouped.name),
  };
}

export async function listMerchantGroupSettings(companyId: string): Promise<{
  merchants: MerchantOption[];
  groups: MerchantGroupWithMembers[];
}> {
  const groupModel = getMerchantGroupModel();
  const merchants = await prisma.user.findMany({
    where: { companyId, couponCodes: { isEmpty: false } },
    orderBy: [{ knownName: "asc" }, { name: "asc" }, { email: "asc" }],
    select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
  });

  if (!groupModel) {
    return {
      merchants: merchants.map((merchant) => ({
        ...merchant,
        displayName: getMerchantDisplayName(merchant),
        groupId: null,
        groupName: null,
      })),
      groups: [],
    };
  }

  const groups = (await groupModel.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      members: { select: { userId: true } },
    },
  })) as Array<{ id: string; name: string; members: Array<{ userId: string }> }>;

  const groupByUserId = new Map<string, { id: string; name: string }>();
  for (const group of groups) {
    for (const member of group.members) {
      groupByUserId.set(member.userId, { id: group.id, name: group.name });
    }
  }

  const merchantOptions = merchants.map((merchant) => {
    const group = groupByUserId.get(merchant.id) ?? null;
    return {
      ...merchant,
      displayName: getMerchantDisplayName(merchant),
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
    };
  });
  const merchantById = new Map(merchantOptions.map((merchant) => [merchant.id, merchant]));

  const groupsWithMembers: MerchantGroupWithMembers[] = groups.map((group) => {
    const members: MerchantOption[] = [];
    for (const member of group.members) {
      const merchant = merchantById.get(member.userId);
      if (merchant) members.push(merchant);
    }
    return { id: group.id, name: group.name, members };
  });

  return {
    merchants: merchantOptions,
    groups: groupsWithMembers,
  };
}

export async function createMerchantGroup(companyId: string, name: string) {
  const model = getMerchantGroupModel();
  if (!model) throw new Error("MerchantGroup table is not available. Run the latest Prisma migration first.");
  return model.create({
    data: { companyId, name: name.trim() },
  });
}

export async function updateMerchantGroup(companyId: string, groupId: string, name: string) {
  const model = getMerchantGroupModel();
  if (!model) throw new Error("MerchantGroup table is not available. Run the latest Prisma migration first.");
  const existing = await model.findFirst({ where: { id: groupId, companyId } });
  if (!existing) throw new Error("Merchant group not found");
  return model.update({
    where: { id: groupId },
    data: { name: name.trim() },
  });
}

export async function deleteMerchantGroup(companyId: string, groupId: string) {
  const model = getMerchantGroupModel();
  if (!model) throw new Error("MerchantGroup table is not available. Run the latest Prisma migration first.");
  const existing = await model.findFirst({ where: { id: groupId, companyId } });
  if (!existing) throw new Error("Merchant group not found");
  await model.delete({ where: { id: groupId } });
}

export async function setMerchantGroupMembers(companyId: string, groupId: string, userIds: string[]) {
  const groupModel = getMerchantGroupModel();
  const memberModel = getMerchantGroupMemberModel();
  if (!groupModel || !memberModel) {
    throw new Error("MerchantGroup tables are not available. Run the latest Prisma migration first.");
  }

  const existing = await groupModel.findFirst({ where: { id: groupId, companyId } });
  if (!existing) throw new Error("Merchant group not found");

  const merchants = await prisma.user.findMany({
    where: { companyId, id: { in: userIds }, couponCodes: { isEmpty: false } },
    select: { id: true },
  });
  const validUserIds = merchants.map((merchant) => merchant.id);

  await memberModel.deleteMany({
    where: {
      OR: [
        { merchantGroupId: groupId },
        ...(validUserIds.length > 0 ? [{ userId: { in: validUserIds } }] : []),
      ],
    },
  });

  for (const userId of validUserIds) {
    await memberModel.create({
      data: { merchantGroupId: groupId, userId },
    });
  }
}
