import { prisma } from "@/lib/prisma";

// Safe model accessor types
type OutletModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown | null>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

type OutletUserModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
  create: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
};

type OutletReviewModel = {
  findUnique: (args: unknown) => Promise<unknown | null>;
  upsert: (args: unknown) => Promise<unknown>;
};

type UserModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
};

function getOutletModel(): OutletModel | null {
  return (prisma as unknown as { outlet?: OutletModel }).outlet ?? null;
}

function getOutletUserModel(): OutletUserModel | null {
  return (prisma as unknown as { outletUser?: OutletUserModel }).outletUser ?? null;
}

function getOutletReviewModel(): OutletReviewModel | null {
  return (prisma as unknown as { outletReview?: OutletReviewModel }).outletReview ?? null;
}

function getUserModel(): UserModel | null {
  return (prisma as unknown as { user?: UserModel }).user ?? null;
}

export function supportsOutlets(): boolean {
  return !!getOutletModel() && !!getOutletUserModel() && !!getOutletReviewModel();
}

export type OutletUserAssignment = {
  userId: string;
  couponCodes: string[];
  user: {
    id: string;
    name: string | null;
    email: string | null;
    knownName?: string | null;
    mobile?: string | null;
  };
};

export type OutletWithUsers = {
  id: string;
  name: string;
  companyId: string;
  users: OutletUserAssignment[];
};

type OutletUserAssignmentRow = Omit<OutletUserAssignment, "user">;
type OutletUserDetails = OutletUserAssignment["user"];
type OutletRowWithUserAssignments = Omit<OutletWithUsers, "users"> & {
  users: OutletUserAssignmentRow[];
};

async function hydrateOutletUsers(
  outlets: OutletRowWithUserAssignments[]
): Promise<OutletWithUsers[]> {
  const userModel = getUserModel();
  const userIds = Array.from(
    new Set(outlets.flatMap((outlet) => outlet.users.map((assignment) => assignment.userId)))
  );

  if (userIds.length === 0 || !userModel) {
    return outlets.map((outlet) => ({
      ...outlet,
      users: outlet.users.map((assignment) => ({
        ...assignment,
        user: {
          id: assignment.userId,
          name: null,
          email: null,
          knownName: null,
          mobile: null,
        },
      })),
    }));
  }

  const users = (await userModel.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, knownName: true, mobile: true },
  })) as OutletUserDetails[];
  const userById = new Map(users.map((user) => [user.id, user]));

  return outlets.map((outlet) => ({
    ...outlet,
    users: outlet.users.map((assignment) => ({
      ...assignment,
      user: userById.get(assignment.userId) ?? {
        id: assignment.userId,
        name: null,
        email: null,
        knownName: null,
        mobile: null,
      },
    })),
  }));
}

export async function getOutletsByCompanyId(companyId: string): Promise<OutletWithUsers[]> {
  const model = getOutletModel();
  if (!model) return [];
  try {
    const rows = await model.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: {
        users: true,
      },
    });
    return hydrateOutletUsers(rows as OutletRowWithUserAssignments[]);
  } catch {
    return [];
  }
}

export async function getOutletById(outletId: string, companyId: string): Promise<OutletWithUsers | null> {
  const model = getOutletModel();
  if (!model) return null;
  try {
    const row = await model.findFirst({
      where: { id: outletId, companyId },
      include: {
        users: true,
      },
    });
    if (!row) return null;
    const [outlet] = await hydrateOutletUsers([row as OutletRowWithUserAssignments]);
    return outlet ?? null;
  } catch {
    return null;
  }
}

export async function createOutlet(data: { companyId: string; name: string }): Promise<OutletWithUsers> {
  const model = getOutletModel();
  if (!model) throw new Error("Outlet table is not available. Run the latest Prisma migration first.");
  const row = await model.create({
    data: { companyId: data.companyId, name: data.name.trim() },
    include: {
      users: true,
    },
  });
  const [outlet] = await hydrateOutletUsers([row as OutletRowWithUserAssignments]);
  return outlet;
}

export async function updateOutlet(outletId: string, companyId: string, data: { name: string }): Promise<OutletWithUsers> {
  const model = getOutletModel();
  if (!model) throw new Error("Outlet table is not available. Run the latest Prisma migration first.");
  // Verify ownership
  const existing = await model.findFirst({ where: { id: outletId, companyId } });
  if (!existing) throw new Error("Outlet not found");
  const row = await model.update({
    where: { id: outletId },
    data: { name: data.name.trim() },
    include: {
      users: true,
    },
  });
  const [outlet] = await hydrateOutletUsers([row as OutletRowWithUserAssignments]);
  return outlet;
}

export async function deleteOutlet(outletId: string, companyId: string): Promise<void> {
  const model = getOutletModel();
  if (!model) throw new Error("Outlet table is not available. Run the latest Prisma migration first.");
  const existing = await model.findFirst({ where: { id: outletId, companyId } });
  if (!existing) throw new Error("Outlet not found");
  await model.delete({ where: { id: outletId } });
}

export async function assignUserToOutlet(data: {
  outletId: string;
  userId: string;
  couponCodes: string[];
}): Promise<void> {
  const model = getOutletUserModel();
  if (!model) throw new Error("OutletUser table is not available. Run the latest Prisma migration first.");
  await model.deleteMany({ where: { outletId: data.outletId, userId: data.userId } });
  await model.create({
    data: {
      outletId: data.outletId,
      userId: data.userId,
      couponCodes: data.couponCodes.map((c) => c.trim()).filter(Boolean),
    },
  });
}

export async function removeUserFromOutlet(outletId: string, userId: string): Promise<void> {
  const model = getOutletUserModel();
  if (!model) throw new Error("OutletUser table is not available. Run the latest Prisma migration first.");
  await model.deleteMany({ where: { outletId, userId } });
}

export async function getUserOutlets(userId: string, companyId: string): Promise<OutletWithUsers[]> {
  const model = getOutletUserModel();
  if (!model) return [];
  try {
    const rows = await model.findMany({
      where: { userId },
      include: {
        outlet: {
          include: {
            users: true,
          },
        },
      },
    }) as Array<{ outlet: OutletRowWithUserAssignments & { companyId: string } }>;
    return hydrateOutletUsers(rows.map((r) => r.outlet).filter((o) => o.companyId === companyId));
  } catch {
    return [];
  }
}

export async function getOutletReview(orderId: string): Promise<{
  id: string;
  reviewRequested: string | null;
  reviewCollected: string | null;
} | null> {
  const model = getOutletReviewModel();
  if (!model) return null;
  try {
    const row = await model.findUnique({ where: { orderId } });
    return row as { id: string; reviewRequested: string | null; reviewCollected: string | null } | null;
  } catch {
    return null;
  }
}

export async function upsertOutletReview(data: {
  outletId: string;
  orderId: string;
  reviewRequested?: string;
  reviewCollected?: string;
}): Promise<{ id: string; reviewRequested: string | null; reviewCollected: string | null }> {
  const model = getOutletReviewModel();
  if (!model) throw new Error("OutletReview table is not available. Run the latest Prisma migration first.");
  const row = await model.upsert({
    where: { orderId: data.orderId },
    create: {
      outletId: data.outletId,
      orderId: data.orderId,
      reviewRequested: data.reviewRequested ?? null,
      reviewCollected: data.reviewCollected ?? null,
    },
    update: {
      ...(data.reviewRequested !== undefined ? { reviewRequested: data.reviewRequested || null } : {}),
      ...(data.reviewCollected !== undefined ? { reviewCollected: data.reviewCollected || null } : {}),
    },
  });
  return row as { id: string; reviewRequested: string | null; reviewCollected: string | null };
}
