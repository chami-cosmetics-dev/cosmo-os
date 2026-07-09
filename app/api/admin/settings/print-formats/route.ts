import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const printFormatSchema = z.object({
  name: z.string().trim().min(1).max(120),
  html: z.string().min(1).max(250_000),
  isEnabled: z.boolean().optional(),
});

export async function GET() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const formats = await prisma.printFormat.findMany({
    where: { companyId },
    orderBy: [{ isEnabled: "desc" }, { name: "asc" }],
    select: { id: true, name: true, html: true, isEnabled: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({
    formats: formats.map((format) => ({
      ...format,
      createdAt: format.createdAt.toISOString(),
      updatedAt: format.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context!.user!.companyId;
  const userId = auth.context!.user!.id;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = printFormatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const format = await prisma.printFormat.create({
      data: {
        companyId,
        name: parsed.data.name,
        html: parsed.data.html,
        isEnabled: parsed.data.isEnabled ?? true,
      },
      select: { id: true, name: true, html: true, isEnabled: true, createdAt: true, updatedAt: true },
    });

    await writeAuditLog({
      companyId,
      actorUserId: userId,
      module: "settings",
      action: "setting_created",
      entityType: "PrintFormat",
      entityId: format.id,
      summary: `Created print format ${format.name}`,
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
