import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const createSchema = z.object({
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

export async function GET() {
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

  const items = await prisma.sampleFreeIssueItem.findMany({
    where: { companyId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      productItemId: true,
      type: true,
      productItem: { select: { productTitle: true, variantTitle: true } },
      createdAt: true,
    },
  });

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
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

  const item = await prisma.sampleFreeIssueItem.create({
    data: {
      companyId,
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

  return NextResponse.json(item);
}
