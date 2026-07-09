import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { assertEligibleMerchantUser } from "@/lib/merchant-eligibility";
import {
  manualInvoicePrefixSchema,
  manualInvoiceSeqPaddingSchema,
} from "@/lib/validation/manual-order";
import { cuidSchema, emailSchema, LIMITS, trimmedString } from "@/lib/validation";

const updateLocationSchema = z.object({
  name: trimmedString(1, LIMITS.locationName.max),
  logoUrl: z.string().url().max(LIMITS.logoUrl.max).optional().nullable(),
  address: z.string().max(LIMITS.address.max).optional(),
  shadowParentLocationId: cuidSchema.nullable().optional(),
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
  defaultOrderPrintFormatId: cuidSchema.nullable().optional(),
  manualInvoicePrefix: z
    .union([manualInvoicePrefixSchema, z.literal("")])
    .nullable()
    .optional(),
  manualInvoiceSeqPadding: manualInvoiceSeqPaddingSchema.optional(),
  erpnextCompany: z.string().max(140).optional().nullable(),
  erpnextWarehouse: z.string().max(140).optional().nullable(),
  erpnextInstanceId: cuidSchema.nullable().optional(),
  fulfillmentBlocked: z.boolean().optional(),
  isMainCompany: z.boolean().optional(),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function PATCH(
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
  const parsed = updateLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: idResult.data, companyId },
  });

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const d = parsed.data;
  if (d.defaultMerchantUserId) {
    const isEligible = await assertEligibleMerchantUser(prisma, {
      userId: d.defaultMerchantUserId,
      companyId,
    });
    if (!isEligible) {
      return NextResponse.json(
        { error: "Default merchant must be Sales & Marketing or Digital Marketing staff" },
        { status: 400 }
      );
    }
  }
  if (d.defaultOrderPrintFormatId) {
    const format = await prisma.printFormat.findFirst({
      where: { id: d.defaultOrderPrintFormatId, companyId, isEnabled: true },
      select: { id: true },
    });
    if (!format) {
      return NextResponse.json({ error: "Default print format must be an enabled print format." }, { status: 400 });
    }
  }
  if (d.shadowParentLocationId) {
    if (d.shadowParentLocationId === idResult.data) {
      return NextResponse.json(
        { error: "A location cannot shadow itself" },
        { status: 400 }
      );
    }
    const parent = await prisma.companyLocation.findFirst({
      where: { id: d.shadowParentLocationId, companyId },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Shadow parent location not found" }, { status: 400 });
    }
  }
  const toOpt = (v: string | undefined) =>
    v === undefined ? undefined : (v.trim() || null);
  const updated = await prisma.companyLocation.update({
    where: { id: idResult.data },
    data: {
      name: d.name,
      ...(d.shadowParentLocationId !== undefined && {
        shadowParentLocationId: d.shadowParentLocationId,
      }),
      ...(d.logoUrl !== undefined && { logoUrl: d.logoUrl }),
      address: d.address === undefined ? undefined : (d.address?.trim() || null),
      shortName: toOpt(d.shortName),
      invoiceHeader: toOpt(d.invoiceHeader),
      invoiceSubHeader: toOpt(d.invoiceSubHeader),
      invoiceFooter: toOpt(d.invoiceFooter),
      invoicePhone: toOpt(d.invoicePhone),
      invoiceEmail: d.invoiceEmail === undefined ? undefined : (d.invoiceEmail ?? null),
      shopifyLocationId: toOpt(d.shopifyLocationId),
      shopifyShopName: toOpt(d.shopifyShopName),
      shopifyAdminStoreHandle: toOpt(d.shopifyAdminStoreHandle),
      locationReference: toOpt(d.locationReference),
      defaultMerchantUserId: d.defaultMerchantUserId ?? null,
      defaultOrderPrintFormatId: d.defaultOrderPrintFormatId ?? null,
      ...(d.manualInvoicePrefix !== undefined && {
        manualInvoicePrefix:
          d.manualInvoicePrefix === null || d.manualInvoicePrefix === ""
            ? null
            : d.manualInvoicePrefix,
      }),
      ...(d.manualInvoiceSeqPadding !== undefined && {
        manualInvoiceSeqPadding: d.manualInvoiceSeqPadding,
      }),
      erpnextCompany: toOpt(d.erpnextCompany ?? undefined),
      erpnextWarehouse: toOpt(d.erpnextWarehouse ?? undefined),
      erpnextInstanceId: d.erpnextInstanceId ?? null,
      ...(d.fulfillmentBlocked !== undefined && { fulfillmentBlocked: d.fulfillmentBlocked }),
      ...(d.isMainCompany !== undefined && { isMainCompany: d.isMainCompany }),
    },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      address: true,
      shadowParentLocationId: true,
      shadowParentLocation: {
        select: { id: true, name: true },
      },
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
      defaultOrderPrintFormatId: true,
      manualInvoicePrefix: true,
      manualInvoiceNextSeq: true,
      manualInvoiceSeqPadding: true,
      erpnextCompany: true,
      erpnextWarehouse: true,
      erpnextInstanceId: true,
      fulfillmentBlocked: true,
      isMainCompany: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
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

  const location = await prisma.companyLocation.findFirst({
    where: { id: idResult.data, companyId },
  });

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  await prisma.companyLocation.delete({
    where: { id: idResult.data },
  });

  return NextResponse.json({ success: true });
}
