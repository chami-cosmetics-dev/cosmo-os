import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const updatePrintFormatSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  html: z.string().min(1).max(250_000).optional(),
  isEnabled: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  const userId = auth.context!.user!.id;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) return NextResponse.json({ error: "Invalid print format ID" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const parsed = updatePrintFormatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.printFormat.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true, name: true, html: true, isEnabled: true },
  });
  if (!existing) return NextResponse.json({ error: "Print format not found" }, { status: 404 });

  try {
    const format = await prisma.printFormat.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.html !== undefined && { html: parsed.data.html }),
        ...(parsed.data.isEnabled !== undefined && { isEnabled: parsed.data.isEnabled }),
      },
      select: { id: true, name: true, html: true, isEnabled: true, createdAt: true, updatedAt: true },
    });

    await writeAuditLog({
      companyId,
      actorUserId: userId,
      module: "settings",
      action: "setting_updated",
      entityType: "PrintFormat",
      entityId: format.id,
      summary: `Updated print format ${format.name}`,
      beforeData: existing,
      afterData: format,
    });

    return NextResponse.json({
      ...format,
      createdAt: format.createdAt.toISOString(),
      updatedAt: format.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "A print format with that name already exists." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  const userId = auth.context!.user!.id;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) return NextResponse.json({ error: "Invalid print format ID" }, { status: 400 });

  const existing = await prisma.printFormat.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true, name: true },
  });
  if (!existing) return NextResponse.json({ error: "Print format not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.companyLocation.updateMany({
      where: { companyId, defaultOrderPrintFormatId: existing.id },
      data: { defaultOrderPrintFormatId: null },
    }),
    prisma.printFormat.delete({ where: { id: existing.id } }),
  ]);

  await writeAuditLog({
    companyId,
    actorUserId: userId,
    module: "settings",
    action: "setting_deleted",
    entityType: "PrintFormat",
    entityId: existing.id,
    summary: `Deleted print format ${existing.name}`,
  });

  return NextResponse.json({ ok: true });
}
