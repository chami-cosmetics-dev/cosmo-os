import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ActiveOutletError,
  getActiveOutletState,
  setActiveOutlet,
} from "@/lib/active-outlet";
import { getCurrentUserContext } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context?.user?.id || !context.user.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getActiveOutletState(
    context.user.id,
    context.user.companyId,
  );

  // Single assigned outlet: auto-confirm for today so APIs stay in sync.
  if (
    state.assignedOutlets.length === 1 &&
    (!state.activeOutlet ||
      state.activeOutletDateKey !== state.todayKey ||
      state.activeOutlet.id !== state.assignedOutlets[0]!.id)
  ) {
    const active = await setActiveOutlet({
      userId: context.user.id,
      companyId: context.user.companyId,
      outletId: state.assignedOutlets[0]!.id,
    });
    return NextResponse.json({
      assignedOutlets: state.assignedOutlets,
      activeOutlet: active,
      activeOutletDateKey: state.todayKey,
      todayKey: state.todayKey,
      needsSelection: false,
    });
  }

  return NextResponse.json({
    assignedOutlets: state.assignedOutlets,
    activeOutlet: state.activeOutlet,
    activeOutletDateKey: state.activeOutletDateKey,
    todayKey: state.todayKey,
    needsSelection: state.needsServerSelection,
  });
}

const bodySchema = z.object({
  outletId: cuidSchema,
});

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user?.id || !context.user.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const active = await setActiveOutlet({
      userId: context.user.id,
      companyId: context.user.companyId,
      outletId: parsed.data.outletId,
    });
    return NextResponse.json({
      activeOutlet: active,
      todayKey: (await getActiveOutletState(context.user.id, context.user.companyId))
        .todayKey,
    });
  } catch (error) {
    if (error instanceof ActiveOutletError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
