import "server-only";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

export type AssignedOutlet = { id: string; name: string };

export type ActiveOutletState = {
  assignedOutlets: AssignedOutlet[];
  activeOutlet: AssignedOutlet | null;
  activeOutletDateKey: string | null;
  todayKey: string;
  /** True when client should show the picker (ignore sessionStorage — client adds that). */
  needsServerSelection: boolean;
};

function todayColomboKey(now = new Date()): string {
  return formatAppIsoDate(now, "");
}

/** Assigned outlets for a staff user (join table, fallback to legacy outletId). */
export async function listAssignedOutlets(
  userId: string,
  companyId: string,
): Promise<AssignedOutlet[]> {
  const profile = await prisma.employeeProfile.findFirst({
    where: { userId, companyId },
    select: {
      outletId: true,
      outlet: { select: { id: true, name: true } },
      outletAssignments: {
        select: { outlet: { select: { id: true, name: true } } },
        orderBy: { outlet: { name: "asc" } },
      },
    },
  });
  if (!profile) return [];

  const byId = new Map<string, AssignedOutlet>();
  for (const row of profile.outletAssignments) {
    byId.set(row.outlet.id, { id: row.outlet.id, name: row.outlet.name });
  }
  if (profile.outlet) {
    byId.set(profile.outlet.id, {
      id: profile.outlet.id,
      name: profile.outlet.name,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActiveOutletState(
  userId: string,
  companyId: string,
): Promise<ActiveOutletState> {
  const todayKey = todayColomboKey();
  const profile = await prisma.employeeProfile.findFirst({
    where: { userId, companyId },
    select: {
      outletId: true,
      activeOutletDateKey: true,
      outlet: { select: { id: true, name: true } },
      outletAssignments: {
        select: { outlet: { select: { id: true, name: true } } },
        orderBy: { outlet: { name: "asc" } },
      },
    },
  });

  const assignedOutlets = (() => {
    if (!profile) return [] as AssignedOutlet[];
    const byId = new Map<string, AssignedOutlet>();
    for (const row of profile.outletAssignments) {
      byId.set(row.outlet.id, { id: row.outlet.id, name: row.outlet.name });
    }
    if (profile.outlet) {
      byId.set(profile.outlet.id, {
        id: profile.outlet.id,
        name: profile.outlet.name,
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const activeOutlet =
    profile?.outlet &&
    assignedOutlets.some((o) => o.id === profile.outletId)
      ? { id: profile.outlet.id, name: profile.outlet.name }
      : assignedOutlets.length === 1
        ? assignedOutlets[0]!
        : null;

  const dateOk = profile?.activeOutletDateKey === todayKey;
  const needsServerSelection =
    assignedOutlets.length > 1 &&
    (!activeOutlet || !dateOk || !assignedOutlets.some((o) => o.id === activeOutlet.id));

  return {
    assignedOutlets,
    activeOutlet,
    activeOutletDateKey: profile?.activeOutletDateKey ?? null,
    todayKey,
    needsServerSelection,
  };
}

/**
 * Set today's working outlet. Must be one of the user's assigned outlets.
 * Also stamps activeOutletDateKey (Colombo) and keeps outletId in sync for
 * existing shop-scope / coupon grouping code.
 */
export async function setActiveOutlet(input: {
  userId: string;
  companyId: string;
  outletId: string;
}): Promise<AssignedOutlet> {
  const assigned = await listAssignedOutlets(input.userId, input.companyId);
  const match = assigned.find((o) => o.id === input.outletId);
  if (!match) {
    throw new ActiveOutletError("Outlet is not assigned to this user", 400);
  }

  const profile = await prisma.employeeProfile.findFirst({
    where: { userId: input.userId, companyId: input.companyId },
    select: { id: true },
  });
  if (!profile) {
    throw new ActiveOutletError("Employee profile not found", 404);
  }

  const todayKey = todayColomboKey();
  await prisma.employeeProfile.update({
    where: { id: profile.id },
    data: {
      outletId: match.id,
      activeOutletDateKey: todayKey,
    },
  });

  return match;
}

/**
 * Replace outlet assignments. Syncs legacy outletId to keep a valid active:
 * keep current if still assigned, else first assigned, else null.
 */
export async function replaceOutletAssignments(input: {
  employeeProfileId: string;
  companyId: string;
  outletIds: string[];
  currentOutletId?: string | null;
}): Promise<{ outletId: string | null; outletIds: string[] }> {
  const uniqueIds = [...new Set(input.outletIds.filter(Boolean))];
  if (uniqueIds.length > 0) {
    const found = await prisma.outlet.findMany({
      where: { companyId: input.companyId, id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new ActiveOutletError("One or more outlets are invalid", 400);
    }
  }

  await prisma.employeeProfileOutlet.deleteMany({
    where: { employeeProfileId: input.employeeProfileId },
  });
  if (uniqueIds.length > 0) {
    await prisma.employeeProfileOutlet.createMany({
      data: uniqueIds.map((outletId) => ({
        employeeProfileId: input.employeeProfileId,
        outletId,
      })),
    });
  }

  const nextOutletId =
    input.currentOutletId && uniqueIds.includes(input.currentOutletId)
      ? input.currentOutletId
      : uniqueIds[0] ?? null;

  await prisma.employeeProfile.update({
    where: { id: input.employeeProfileId },
    data: {
      outletId: nextOutletId,
      ...(nextOutletId
        ? {}
        : { activeOutletDateKey: null }),
    },
  });

  return { outletId: nextOutletId, outletIds: uniqueIds };
}

export class ActiveOutletError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ActiveOutletError";
    this.status = status;
  }
}
