import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

const updateSchema = z.object({
  label: trimmedString(1, LIMITS.kokoCompanyLabel.max),
  kokoName: trimmedString(1, LIMITS.kokoCompanyName.max),
  invoicePrefix: trimmedString(1, LIMITS.kokoCompanyPrefix.max),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.kokoCompany.findFirst({
    where: { id: idResult.data, companyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Check label uniqueness if label changed
  if (parsed.data.label !== existing.label) {
    const labelConflict = await prisma.kokoCompany.findFirst({
      where: { companyId, label: parsed.data.label, id: { not: idResult.data } },
    });
    if (labelConflict) {
      return NextResponse.json(
        { error: "A company with this label already exists" },
        { status: 409 }
      );
    }
  }

  const item = await prisma.kokoCompany.update({
    where: { id: idResult.data },
    data: {
      label: parsed.data.label,
      kokoName: parsed.data.kokoName,
      invoicePrefix: parsed.data.invoicePrefix,
    },
    select: { id: true, label: true, kokoName: true, invoicePrefix: true, createdAt: true },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_updated",
    entityType: "KokoCompany",
    entityId: item.id,
    summary: `Updated Koko company "${existing.label}"`,
    beforeData: { label: existing.label, kokoName: existing.kokoName, invoicePrefix: existing.invoicePrefix },
    afterData: { label: item.label, kokoName: item.kokoName, invoicePrefix: item.invoicePrefix },
  });

  return NextResponse.json(item);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await prisma.kokoCompany.findFirst({
    where: { id: idResult.data, companyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  await prisma.kokoCompany.delete({ where: { id: idResult.data } });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_deleted",
    entityType: "KokoCompany",
    entityId: idResult.data,
    summary: `Deleted Koko company "${existing.label}"`,
    beforeData: { label: existing.label, kokoName: existing.kokoName, invoicePrefix: existing.invoicePrefix },
  });

  return NextResponse.json({ success: true });
}
