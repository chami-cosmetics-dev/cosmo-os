import { NextRequest, NextResponse } from "next/server";

import { loadCustomerInsight } from "@/lib/customer-insight/load";
import { isAllocatedOwner } from "@/lib/customer-insight/ownership";
import { updateContactInsightProfile } from "@/lib/customer-insight/profile";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  customerInsightContactParamsSchema,
  customerInsightInvoicesQuerySchema,
  customerInsightProfilePatchSchema,
} from "@/lib/validation/customer-insight";

type Params = { params: Promise<{ contactId: string }> };

async function viewerFromAuth(auth: {
  context?: {
    user?: {
      knownName?: string | null;
      name?: string | null;
      email?: string | null;
      id?: string;
    } | null;
    roleNames?: string[];
    permissionKeys?: string[];
  } | null;
}) {
  const user = auth.context?.user;
  const dbUser =
    user?.id
      ? await prisma.user.findUnique({
          where: { id: user.id },
          select: { couponCodes: true },
        })
      : null;

  return {
    knownName: user?.knownName ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    roleNames: (auth.context?.roleNames as string[]) ?? [],
    permissionKeys: (auth.context?.permissionKeys as string[]) ?? [],
    couponCodes: dbUser?.couponCodes ?? null,
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requirePermission("contacts.insight.read");
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

  const { contactId } = await params;
  const idParsed = customerInsightContactParamsSchema.safeParse({ contactId });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: idParsed.error.flatten() },
      { status: 400 }
    );
  }

  const queryParsed = customerInsightInvoicesQuerySchema.safeParse({
    invoicesPage: request.nextUrl.searchParams.get("invoicesPage") ?? undefined,
    invoicesPageSize: request.nextUrl.searchParams.get("invoicesPageSize") ?? undefined,
    brand: request.nextUrl.searchParams.get("brand") ?? undefined,
    item: request.nextUrl.searchParams.get("item") ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: queryParsed.error.flatten() },
      { status: 400 }
    );
  }

  const insight = await loadCustomerInsight({
    companyId,
    contactId: idParsed.data.contactId,
    invoicesPage: queryParsed.data.invoicesPage,
    invoicesPageSize: queryParsed.data.invoicesPageSize,
    historyBrand: queryParsed.data.brand,
    historyItem: queryParsed.data.item,
    viewer: await viewerFromAuth(auth),
  });
  if (!insight) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json(insight);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requirePermission("contacts.insight.read");
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

  const { contactId } = await params;
  const idParsed = customerInsightContactParamsSchema.safeParse({ contactId });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: idParsed.error.flatten() },
      { status: 400 }
    );
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: idParsed.data.contactId, companyId },
    select: { id: true, assignedMerchant: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const viewer = await viewerFromAuth(auth);
  if (!isAllocatedOwner(viewer, contact.assignedMerchant)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = customerInsightProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.addPhoneNumber) {
    const keys = (auth.context?.permissionKeys as string[]) ?? [];
    if (!keys.includes("contacts.merge")) {
      return NextResponse.json(
        { error: "Missing permission: contacts.merge" },
        { status: 403 }
      );
    }
  }

  try {
    const updated = await updateContactInsightProfile({
      companyId,
      contactId: contact.id,
      patch: parsed.data,
    });
    if (!updated) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({
      contact: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phoneNumber: updated.phoneNumber,
        phones: updated.phones?.map((p) => p.phoneNumber) ?? [],
        gender: updated.gender,
        language: updated.language,
        address: updated.address,
        city: updated.city,
        birthYear: updated.birthYear,
        birthMonth: updated.birthMonth,
        birthDay: updated.birthDay,
        assignedMerchant: updated.assignedMerchant,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
