import { NextRequest, NextResponse } from "next/server";

import { assignUserToOutlet, getOutletById } from "@/lib/outlet-utils";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as {
    outletId?: unknown;
    userId?: unknown;
    couponCodes?: unknown;
  };
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  const userId = typeof body.userId === "string" ? body.userId : "";
  const couponCodes = Array.isArray(body.couponCodes)
    ? (body.couponCodes as unknown[]).filter((c): c is string => typeof c === "string")
    : [];

  if (!outletId || !userId) {
    return NextResponse.json({ error: "outletId and userId are required" }, { status: 400 });
  }

  try {
    const staffUser = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { couponCodes: true },
    });
    if (!staffUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await assignUserToOutlet({
      outletId,
      userId,
      couponCodes: couponCodes.length > 0 ? couponCodes : staffUser.couponCodes,
    });
    const outlet = await getOutletById(outletId, companyId);
    return NextResponse.json({ outlet });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to assign user";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
