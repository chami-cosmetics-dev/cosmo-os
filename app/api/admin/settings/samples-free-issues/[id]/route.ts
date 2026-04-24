import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

const updateSchema = z.object({
  name: trimmedString(1, LIMITS.sampleFreeIssueItemName.max),
  productItemId: z.string().optional().nullable(),
  type: z.enum(["sample", "free_issue"]),
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
  const auth = await requirePermission("settings.fulfillment");
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

  const existing = await prisma.sampleFreeIssueItem.findFirst({
    where: { id: idResult.data, companyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  if (parsed.data.productItemId) {
    const productItem = await prisma.productItem.findFirst({
      where: { id: parsed.data.productItemId, companyId },
    });
    if (!productItem) {
      return NextResponse.json(
        { error: "Product item not found or does not belong to your company" },
        { status: 400 }
      );
    }
  }

  const item = await prisma.sampleFreeIssueItem.update({
    where: { id: idResult.data },
    data: {
      name: parsed.data.name,
      productItemId: parsed.data.productItemId || null,
      type: parsed.data.type,
    },
    select: {
      id: true,
      name: true,
      productItemId: true,
      type: true,
      productItem: { select: { productTitle: true, variantTitle: true } },
      createdAt: true,
    },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_updated",
    entityType: "SampleFreeIssueItem",
    entityId: item.id,
    summary: `Updated ${existing.type} item ${existing.name}`,
    beforeData: {
      name: existing.name,
      type: existing.type,
      productItemId: existing.productItemId,
    },
    afterData: {
      name: item.name,
      type: item.type,
      productItemId: item.productItemId,
    },
  });

  return NextResponse.json(item);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.fulfillment");
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

  const existing = await prisma.sampleFreeIssueItem.findFirst({
    where: { id: idResult.data, companyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.sampleFreeIssueItem.delete({
    where: { id: idResult.data },
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "settings",
    action: "setting_deleted",
    entityType: "SampleFreeIssueItem",
    entityId: existing.id,
    summary: `Deleted ${existing.type} item ${existing.name}`,
    beforeData: {
      name: existing.name,
      type: existing.type,
      productItemId: existing.productItemId,
    },
  });

  return NextResponse.json({ success: true });
}
