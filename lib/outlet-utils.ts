import { prisma } from "@/lib/prisma";

// Safe model accessor types
type OutletModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown | null>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

type OutletReviewModel = {
  findUnique: (args: unknown) => Promise<unknown | null>;
  upsert: (args: unknown) => Promise<unknown>;
};

function getOutletModel(): OutletModel | null {
  return (prisma as unknown as { outlet?: OutletModel }).outlet ?? null;
}

function getOutletReviewModel(): OutletReviewModel | null {
  return (prisma as unknown as { outletReview?: OutletReviewModel }).outletReview ?? null;
}

export function supportsOutlets(): boolean {
  return !!getOutletModel() && !!getOutletReviewModel();
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

type OutletEmployeeProfileRow = {
  userId: string;
  user: OutletUserAssignment["user"] & { couponCodes?: string[] | null };
};

type OutletRowWithEmployeeProfiles = Omit<OutletWithUsers, "users"> & {
  employeeProfiles?: OutletEmployeeProfileRow[];
};

function outletRowsToAssignments(rows: OutletRowWithEmployeeProfiles[]): OutletWithUsers[] {
  return rows.map((outlet) => ({
    id: outlet.id,
    name: outlet.name,
    companyId: outlet.companyId,
    users: (outlet.employeeProfiles ?? []).map((profile) => ({
      userId: profile.userId,
      couponCodes: profile.user.couponCodes ?? [],
      user: {
        id: profile.user.id,
        name: profile.user.name,
        email: profile.user.email,
        knownName: profile.user.knownName,
        mobile: profile.user.mobile,
      },
    })),
  }));
}

const outletWithStaffInclude = {
  employeeProfiles: {
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          knownName: true,
          mobile: true,
          couponCodes: true,
        },
      },
    },
  },
};

export async function getOutletsByCompanyId(companyId: string): Promise<OutletWithUsers[]> {
  const model = getOutletModel();
  if (!model) return [];
  try {
    const rows = await model.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: outletWithStaffInclude,
    });
    return outletRowsToAssignments(rows as OutletRowWithEmployeeProfiles[]);
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
      include: outletWithStaffInclude,
    });
    if (!row) return null;
    const [outlet] = outletRowsToAssignments([row as OutletRowWithEmployeeProfiles]);
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
    include: outletWithStaffInclude,
  });
  const [outlet] = outletRowsToAssignments([row as OutletRowWithEmployeeProfiles]);
  return outlet;
}

export async function updateOutlet(outletId: string, companyId: string, data: { name: string }): Promise<OutletWithUsers> {
  const model = getOutletModel();
  if (!model) throw new Error("Outlet table is not available. Run the latest Prisma migration first.");
  const existing = await model.findFirst({ where: { id: outletId, companyId } });
  if (!existing) throw new Error("Outlet not found");
  const row = await model.update({
    where: { id: outletId },
    data: { name: data.name.trim() },
    include: outletWithStaffInclude,
  });
  const [outlet] = outletRowsToAssignments([row as OutletRowWithEmployeeProfiles]);
  return outlet;
}

export async function deleteOutlet(outletId: string, companyId: string): Promise<void> {
  const model = getOutletModel();
  if (!model) throw new Error("Outlet table is not available. Run the latest Prisma migration first.");
  const existing = await model.findFirst({ where: { id: outletId, companyId } });
  if (!existing) throw new Error("Outlet not found");
  await model.delete({ where: { id: outletId } });
}


export async function getUserOutlets(userId: string, companyId: string): Promise<OutletWithUsers[]> {
  const profile = await prisma.employeeProfile.findFirst({
    where: { userId, companyId, outletId: { not: null } },
    select: { outletId: true },
  });
  if (!profile?.outletId) return [];
  const outlet = await getOutletById(profile.outletId, companyId);
  return outlet ? [outlet] : [];
}

export async function getOutletReview(orderId: string): Promise<{
  id: string;
  reviewRequested: string | null;
  reviewCollected: string | null;
  remarks: string | null;
} | null> {
  const model = getOutletReviewModel();
  if (!model) return null;
  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      reviewRequested: string | null;
      reviewCollected: string | null;
      remarks: string | null;
    }>>`SELECT id, "reviewRequested", "reviewCollected", remarks FROM "OutletReview" WHERE "orderId" = ${orderId} LIMIT 1`;
    return rows[0] ?? null;
  } catch {
    try {
      const row = await model.findUnique({ where: { orderId } });
      if (!row) return null;
      return { ...(row as { id: string; reviewRequested: string | null; reviewCollected: string | null }), remarks: null };
    } catch {
      return null;
    }
  }
}

export async function upsertOutletReview(data: {
  outletId: string;
  orderId: string;
  reviewRequested?: string;
  reviewCollected?: string;
  remarks?: string;
}): Promise<{ id: string; reviewRequested: string | null; reviewCollected: string | null; remarks: string | null }> {
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
  if (data.remarks !== undefined) {
    await prisma.$executeRaw`ALTER TABLE "OutletReview" ADD COLUMN IF NOT EXISTS "remarks" TEXT`;
    await prisma.$executeRaw`
      UPDATE "OutletReview"
      SET remarks = ${data.remarks || null}
      WHERE "orderId" = ${data.orderId}
    `;
  }
  return {
    ...(row as { id: string; reviewRequested: string | null; reviewCollected: string | null }),
    remarks: data.remarks ?? null,
  };
}
