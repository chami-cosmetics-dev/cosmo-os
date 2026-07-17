import { prisma } from "@/lib/prisma";

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
  if (!merchant.id) return merchant;
  const group = userToGroup.get(merchant.id);
  return group ? { id: group.id, name: group.name } : merchant;
}

export function buildCouponToMerchantMap(
  users: MerchantUser[],
  userToGroup: Map<string, { id: string; name: string }> = new Map(),
) {
  const couponToMerchant = new Map<string, { id: string | null; name: string }>();
  for (const user of users) {
    const merchant = applyMerchantGroup(
      { id: user.id, name: getMerchantDisplayName(user) },
      userToGroup,
    );
    for (const coupon of user.couponCodes) {
      const normalized = coupon.trim().toLowerCase();
      if (normalized && !couponToMerchant.has(normalized)) {
        couponToMerchant.set(normalized, merchant);
      }
    }
  }
  return couponToMerchant;
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
