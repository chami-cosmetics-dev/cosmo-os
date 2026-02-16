import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, emailSchema, LIMITS, trimmedString } from "@/lib/validation";

const createLocationSchema = z.object({
  name: trimmedString(1, LIMITS.locationName.max),
  address: z.string().max(LIMITS.address.max).optional(),
  shortName: z.string().max(LIMITS.locationShortName.max).optional(),
  invoiceHeader: z.string().max(LIMITS.invoiceHeader.max).optional(),
  invoiceSubHeader: z.string().max(LIMITS.invoiceSubHeader.max).optional(),
  invoiceFooter: z.string().max(LIMITS.invoiceFooter.max).optional(),
  invoicePhone: z.string().max(LIMITS.mobile.max).optional(),
  invoiceEmail: z
    .union([emailSchema, z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  shopifyLocationId: z.string().max(LIMITS.shopifyLocationId.max).optional(),
  shopifyShopName: z.string().max(LIMITS.shopifyShopName.max).optional(),
  defaultMerchantUserId: cuidSchema.nullable().optional(),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET() {
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

  const [locations, merchants] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        shortName: true,
        invoiceHeader: true,
        invoiceSubHeader: true,
        invoiceFooter: true,
        invoicePhone: true,
        invoiceEmail: true,
        shopifyLocationId: true,
        shopifyShopName: true,
        defaultMerchantUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return NextResponse.json({ locations, merchants });
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const parsed = createLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  if (d.defaultMerchantUserId) {
    const merchant = await prisma.user.findFirst({
      where: {
        id: d.defaultMerchantUserId,
        companyId,
      },
    });
    if (!merchant) {
      return NextResponse.json(
        { error: "Default merchant must be a user in your company" },
        { status: 400 }
      );
    }
  }
  const location = await prisma.companyLocation.create({
    data: {
      companyId,
      name: d.name,
      address: d.address?.trim() || null,
      shortName: d.shortName?.trim() || null,
      invoiceHeader: d.invoiceHeader?.trim() || null,
      invoiceSubHeader: d.invoiceSubHeader?.trim() || null,
      invoiceFooter: d.invoiceFooter?.trim() || null,
      invoicePhone: d.invoicePhone?.trim() || null,
      invoiceEmail: d.invoiceEmail ?? null,
      shopifyLocationId: d.shopifyLocationId?.trim() || null,
      shopifyShopName: d.shopifyShopName?.trim() || null,
      defaultMerchantUserId: d.defaultMerchantUserId ?? null,
    },
    select: {
      id: true,
      name: true,
      address: true,
      shortName: true,
      invoiceHeader: true,
      invoiceSubHeader: true,
      invoiceFooter: true,
      invoicePhone: true,
      invoiceEmail: true,
      shopifyLocationId: true,
      shopifyShopName: true,
      defaultMerchantUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(location);
}
