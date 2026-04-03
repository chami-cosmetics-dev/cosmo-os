import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, emailSchema, limitSchema, LIMITS, pageSchema, trimmedString } from "@/lib/validation";

const createLocationSchema = z.object({
  name: trimmedString(1, LIMITS.locationName.max),
  logoUrl: z.string().url().max(LIMITS.logoUrl.max).optional().nullable(),
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
  shopifyAdminStoreHandle: z.string().max(LIMITS.shopifyAdminStoreHandle.max).optional(),
  locationReference: z.string().max(LIMITS.locationReference.max).optional(),
  defaultMerchantUserId: cuidSchema.nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const skip = (page - 1) * limit;

  const [total, locations, merchants] = await Promise.all([
    prisma.companyLocation.count({ where: { companyId } }),
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        logoUrl: true,
        address: true,
        shortName: true,
        invoiceHeader: true,
        invoiceSubHeader: true,
        invoiceFooter: true,
        invoicePhone: true,
        invoiceEmail: true,
        shopifyLocationId: true,
        shopifyShopName: true,
        shopifyAdminStoreHandle: true,
        locationReference: true,
        defaultMerchantUserId: true,
        manualInvoicePrefix: true,
        manualInvoiceNextSeq: true,
        manualInvoiceSeqPadding: true,
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

  return NextResponse.json({ locations, merchants, total, page, limit });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
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
      logoUrl: d.logoUrl ?? null,
      address: d.address?.trim() || null,
      shortName: d.shortName?.trim() || null,
      invoiceHeader: d.invoiceHeader?.trim() || null,
      invoiceSubHeader: d.invoiceSubHeader?.trim() || null,
      invoiceFooter: d.invoiceFooter?.trim() || null,
      invoicePhone: d.invoicePhone?.trim() || null,
      invoiceEmail: d.invoiceEmail ?? null,
      shopifyLocationId: d.shopifyLocationId?.trim() || null,
      shopifyShopName: d.shopifyShopName?.trim() || null,
      shopifyAdminStoreHandle: d.shopifyAdminStoreHandle?.trim() || null,
      locationReference: d.locationReference?.trim() || null,
      defaultMerchantUserId: d.defaultMerchantUserId ?? null,
    },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      address: true,
      shortName: true,
      invoiceHeader: true,
      invoiceSubHeader: true,
      invoiceFooter: true,
      invoicePhone: true,
      invoiceEmail: true,
      shopifyLocationId: true,
      shopifyShopName: true,
      shopifyAdminStoreHandle: true,
      locationReference: true,
      defaultMerchantUserId: true,
      manualInvoicePrefix: true,
      manualInvoiceNextSeq: true,
      manualInvoiceSeqPadding: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(location);
}
