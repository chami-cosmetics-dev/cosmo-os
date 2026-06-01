import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const ACTIVE_WINDOW_DAYS = 180;

function deriveStatus(lastPurchaseAt: Date | null): "active" | "inactive" | "never_purchased" {
  if (!lastPurchaseAt) return "never_purchased";
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ACTIVE_WINDOW_DAYS);
  return lastPurchaseAt >= cutoff ? "active" : "inactive";
}

const querySchema = z.object({
  phone: trimmedString(1, LIMITS.mobile.max),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.read");
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

  const raw = request.nextUrl.searchParams.get("phone") ?? "";
  const parsed = querySchema.safeParse({ phone: raw });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const phone = parsed.data.phone;
  const variants = buildPhoneLookupVariants(phone);
  if (variants.length === 0) {
    return NextResponse.json({ found: false });
  }

  // Search by primary phone on ContactMaster first
  let contact = await prisma.contactMaster.findFirst({
    where: {
      companyId,
      phoneNumber: { in: variants },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      lastPurchaseAt: true,
      recentMerchant: true,
      updatedAt: true,
      createdAt: true,
      remarks: true,
      gender: true,
      workPlace: true,
      occupation: true,
      address: true,
      birthYear: true,
      birthMonth: true,
      birthDay: true,
      serviceProvider: true,
      district: true,
      town: true,
      origin: true,
      customerType: true,
      category: true,
      contactSaved: true,
      whatsappAllowed: true,
      remindAt: true,
      remindTime: true,
    },
  });

  // Fallback: search secondary phones via ContactPhone
  if (!contact) {
    const phoneRecord = await prisma.contactPhone.findFirst({
      where: {
        phoneNumber: { in: variants },
        contact: { is: { companyId } },
      },
      select: {
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            lastPurchaseAt: true,
            recentMerchant: true,
            updatedAt: true,
            createdAt: true,
            remarks: true,
            gender: true,
            workPlace: true,
            occupation: true,
            address: true,
            birthYear: true,
            birthMonth: true,
            birthDay: true,
            serviceProvider: true,
            district: true,
            town: true,
            origin: true,
            customerType: true,
            category: true,
            contactSaved: true,
            whatsappAllowed: true,
            remindAt: true,
            remindTime: true,
          },
        },
      },
    });
    contact = phoneRecord?.contact ?? null;
  }

  if (!contact) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phoneNumber: contact.phoneNumber,
      recentMerchant: contact.recentMerchant,
      lastPurchaseAt: contact.lastPurchaseAt?.toISOString() ?? null,
      status: deriveStatus(contact.lastPurchaseAt),
      updatedAt: contact.updatedAt.toISOString(),
      createdAt: contact.createdAt.toISOString(),
      remarks: contact.remarks,
      gender: contact.gender,
      workPlace: contact.workPlace,
      occupation: contact.occupation,
      address: contact.address,
      birthYear: contact.birthYear,
      birthMonth: contact.birthMonth,
      birthDay: contact.birthDay,
      serviceProvider: contact.serviceProvider,
      district: contact.district,
      town: contact.town,
      origin: contact.origin,
      customerType: contact.customerType,
      category: contact.category,
      contactSaved: contact.contactSaved,
      whatsappAllowed: contact.whatsappAllowed,
      remindAt: contact.remindAt?.toISOString() ?? null,
      remindTime: contact.remindTime,
    },
  });
}
