import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  fetchContactAllocationIds,
  fetchContactAllocationPageData,
  type ContactAllocationFilters,
} from "@/lib/page-data/contact-allocation";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

const filterSchema = z.object({
  serviceProvider: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  town: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  exWebCus: z.string().optional().nullable(),
  exOffCus: z.string().optional().nullable(),
  recentMerchant: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  updatedMonth: z.string().optional().nullable(),
  lastPurchaseMonth: z.string().optional().nullable(),
  customerType: z.string().optional().nullable(),
  whatsappAllowed: z.string().optional().nullable(),
  allocatedTo: z.string().optional().nullable(),
});

const allocationSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("individual"),
    phoneNumber: z.string().trim().min(1).max(40),
    allocatedTo: z.string().trim().min(1).max(255),
  }),
  z.object({
    mode: z.literal("multiple"),
    phoneNumbers: z.array(z.string().trim().min(1).max(40)).min(1).max(500),
    allocatedTo: z.string().trim().min(1).max(255),
  }),
  z.object({
    mode: z.literal("bulk"),
    filters: filterSchema,
    allocatedTo: z.string().trim().min(1).max(255),
  }),
]);

function filtersFromSearchParams(searchParams: URLSearchParams): ContactAllocationFilters {
  return {
    serviceProvider: searchParams.get("serviceProvider"),
    source: searchParams.get("source"),
    country: searchParams.get("country"),
    district: searchParams.get("district"),
    town: searchParams.get("town"),
    zone: searchParams.get("zone"),
    gender: searchParams.get("gender"),
    origin: searchParams.get("origin"),
    category: searchParams.get("category"),
    exWebCus: searchParams.get("exWebCus"),
    exOffCus: searchParams.get("exOffCus"),
    recentMerchant: searchParams.get("recentMerchant"),
    area: searchParams.get("area"),
    updatedMonth: searchParams.get("updatedMonth"),
    lastPurchaseMonth: searchParams.get("lastPurchaseMonth"),
    customerType: searchParams.get("customerType"),
    whatsappAllowed: searchParams.get("whatsappAllowed"),
    allocatedTo: searchParams.get("allocatedTo"),
  };
}

async function getCompanyId() {
  const auth = await requireAnyPermission(["contacts.allocation.read", "contacts.read"]);
  if (!auth.ok) return { auth };
  return { auth, companyId: auth.context!.user?.companyId ?? null };
}

async function logAllocationUpdates({
  companyId,
  contactIds,
  allocatedTo,
  merchantId,
}: {
  companyId: string;
  contactIds: string[];
  allocatedTo: string;
  merchantId: string | null;
}) {
  if (contactIds.length === 0) return;
  await prisma.contactAllocationUpdate.createMany({
    data: contactIds.map((contactId) => ({
      companyId,
      contactId,
      merchantId,
      merchantName: allocatedTo,
      category: "allocation",
    })),
  });
}

async function assignContacts({
  companyId,
  contactIds,
  assignedMerchant,
}: {
  companyId: string;
  contactIds: string[];
  assignedMerchant: string;
}) {
  if (contactIds.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "ContactMaster"
    SET "assignedMerchant" = ${assignedMerchant}
    WHERE "companyId" = ${companyId}
      AND "id" IN (${Prisma.join(contactIds)})
  `;
}

export async function GET(request: NextRequest) {
  const { auth, companyId } = await getCompanyId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const data = await fetchContactAllocationPageData(
    companyId,
    filtersFromSearchParams(request.nextUrl.searchParams)
  );
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["contacts.allocation.manage", "contacts.manage"]);
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
  const parsed = allocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const merchantId = auth.context!.user?.id ?? null;

  if (input.mode === "individual") {
    const variants = buildPhoneLookupVariants(input.phoneNumber);
    const contact = await prisma.contactMaster.findFirst({
      where: { companyId, phoneNumber: { in: variants } },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "No contact found for that TP number" }, { status: 404 });
    }
    await assignContacts({
      companyId,
      contactIds: [contact.id],
      assignedMerchant: input.allocatedTo,
    });
    await logAllocationUpdates({
      companyId,
      contactIds: [contact.id],
      allocatedTo: input.allocatedTo,
      merchantId,
    });
    return NextResponse.json({ success: true, count: 1 });
  }

  if (input.mode === "multiple") {
    const variants = [...new Set(input.phoneNumbers.flatMap((phone) => buildPhoneLookupVariants(phone)))];
    const contacts = await prisma.contactMaster.findMany({
      where: { companyId, phoneNumber: { in: variants } },
      select: { id: true },
    });
    if (contacts.length === 0) {
      return NextResponse.json({ error: "No matching contacts found" }, { status: 404 });
    }
    const contactIds = contacts.map((contact) => contact.id);
    await assignContacts({
      companyId,
      contactIds,
      assignedMerchant: input.allocatedTo,
    });
    await logAllocationUpdates({
      companyId,
      contactIds,
      allocatedTo: input.allocatedTo,
      merchantId,
    });
    return NextResponse.json({ success: true, count: contactIds.length });
  }

  const contactIds = await fetchContactAllocationIds(companyId, input.filters, 5000);
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "No matching contacts found" }, { status: 404 });
  }
  await assignContacts({
    companyId,
    contactIds,
    assignedMerchant: input.allocatedTo,
  });
  await logAllocationUpdates({
    companyId,
    contactIds,
    allocatedTo: input.allocatedTo,
    merchantId,
  });

  return NextResponse.json({ success: true, count: contactIds.length });
}
