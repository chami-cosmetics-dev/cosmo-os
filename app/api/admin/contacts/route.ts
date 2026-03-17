import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getLatestOrderPurchaseAt } from "@/lib/orders-last-purchase";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, emailSchema, trimmedString } from "@/lib/validation";

const createContactSchema = z.object({
  name: trimmedString(1, LIMITS.name.max),
  email: emailSchema.optional().nullable(),
  phoneNumber: z.string().trim().max(LIMITS.mobile.max).optional().nullable(),
  recentMerchant: z.string().trim().max(LIMITS.name.max).optional().nullable(),
});

function normalizeNullableText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.context!.user!.id },
    select: { companyId: true },
  });
  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = normalizeNullableText(parsed.data.email);
  const phoneNumber = normalizeNullableText(parsed.data.phoneNumber);
  const lastPurchaseAt = await getLatestOrderPurchaseAt(companyId, email, phoneNumber);

  const duplicate = await prisma.contactMaster.findFirst({
    where: {
      companyId,
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json(
      { error: "A contact with the same email or phone already exists" },
      { status: 409 }
    );
  }

  const contact = await prisma.contactMaster.create({
    data: {
      companyId,
      name: parsed.data.name,
      email,
      phoneNumber,
      lastPurchaseAt,
      recentMerchant: normalizeNullableText(parsed.data.recentMerchant),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      lastPurchaseAt: true,
      recentMerchant: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      ...contact,
      lastPurchaseAt: contact.lastPurchaseAt?.toISOString() ?? null,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    },
    { status: 201 }
  );
}
