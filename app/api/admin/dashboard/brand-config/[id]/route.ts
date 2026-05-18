import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createPerfLogger } from "@/lib/perf";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, dashboardBrandConfigUpdateSchema } from "@/lib/validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const perf = createPerfLogger("api.admin.dashboard.brand-config.[id].PATCH", {});

  const auth = await requirePermission("dashboard.edit");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = dashboardBrandConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Verify ownership
  const existing = await prisma.dashboardBrandConfig.findFirst({
    where: { id: parsedId.data, companyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Brand config not found" }, { status: 404 });
  }

  const updated = await prisma.dashboardBrandConfig.update({
    where: { id: parsedId.data },
    data: parsed.data,
    select: { id: true, name: true, isSelected: true, sortOrder: true },
  });

  perf.end({ status: 200, ok: true });
  return NextResponse.json({ config: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const perf = createPerfLogger("api.admin.dashboard.brand-config.[id].DELETE", {});

  const auth = await requirePermission("dashboard.edit");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.dashboardBrandConfig.findFirst({
    where: { id: parsedId.data, companyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Brand config not found" }, { status: 404 });
  }

  await prisma.dashboardBrandConfig.delete({ where: { id: parsedId.data } });

  perf.end({ status: 200, ok: true });
  return NextResponse.json({ success: true });
}
