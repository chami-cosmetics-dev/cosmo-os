import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createPerfLogger } from "@/lib/perf";
import { requirePermission } from "@/lib/rbac";
import { dashboardBrandConfigCreateSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.dashboard.brand-config.GET", {
    path: request.nextUrl.pathname,
  });

  const auth = await requirePermission("dashboard.view");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const configs = await prisma.dashboardBrandConfig.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isSelected: true, sortOrder: true },
  });

  perf.end({ status: 200, ok: true });
  return NextResponse.json({ configs }, {
    headers: { "Server-Timing": perf.toServerTimingHeader() },
  });
}

export async function POST(request: NextRequest) {
  const perf = createPerfLogger("api.admin.dashboard.brand-config.POST", {
    path: request.nextUrl.pathname,
  });

  const auth = await requirePermission("dashboard.edit");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = dashboardBrandConfigCreateSchema.safeParse(body);
  if (!parsed.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Get next sort order
  const maxOrder = await prisma.dashboardBrandConfig.aggregate({
    where: { companyId },
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  try {
    const config = await prisma.dashboardBrandConfig.create({
      data: {
        companyId,
        name: parsed.data.name,
        isSelected: true,
        sortOrder: nextSortOrder,
      },
      select: { id: true, name: true, isSelected: true, sortOrder: true },
    });
    perf.end({ status: 201, ok: true });
    return NextResponse.json({ config }, { status: 201, headers: { "Server-Timing": perf.toServerTimingHeader() } });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      perf.end({ status: 409, ok: false });
      return NextResponse.json({ error: "A brand with this name already exists" }, { status: 409 });
    }
    throw err;
  }
}
