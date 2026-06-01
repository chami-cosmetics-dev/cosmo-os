import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { ensureSecondaryContactIdentifiers, findMatchingContacts } from "@/lib/contact-identifiers";
import { getLatestOrderPurchaseAt } from "@/lib/orders-last-purchase";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, emailSchema, trimmedString } from "@/lib/validation";

const createContactSchema = z.object({
  name: trimmedString(1, LIMITS.name.max),
  email: emailSchema.optional().nullable(),
  phoneNumber: z.string().trim().max(LIMITS.mobile.max).optional().nullable(),
  secondaryEmail: emailSchema.optional().nullable(),
  secondaryPhoneNumber: z.string().trim().max(LIMITS.mobile.max).optional().nullable(),
  recentMerchant: z.string().trim().max(LIMITS.name.max).optional().nullable(),
});

function normalizeNullableText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.manage");
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
  const secondaryEmail = normalizeNullableText(parsed.data.secondaryEmail);
  const secondaryPhoneNumber = normalizeNullableText(parsed.data.secondaryPhoneNumber);
  const [primaryLastPurchaseAt, secondaryLastPurchaseAt] = await Promise.all([
    getLatestOrderPurchaseAt(companyId, email, phoneNumber),
    secondaryEmail || secondaryPhoneNumber
      ? getLatestOrderPurchaseAt(companyId, secondaryEmail, secondaryPhoneNumber)
      : Promise.resolve(null),
  ]);
  const lastPurchaseAt =
    primaryLastPurchaseAt && secondaryLastPurchaseAt
      ? primaryLastPurchaseAt > secondaryLastPurchaseAt
        ? primaryLastPurchaseAt
        : secondaryLastPurchaseAt
      : primaryLastPurchaseAt ?? secondaryLastPurchaseAt ?? null;

  const duplicateMatches = await findMatchingContacts(companyId, email, phoneNumber);
  const duplicate = duplicateMatches.emailMatches[0] ?? duplicateMatches.phoneMatches[0] ?? null;
  const secondaryDuplicateMatches =
    secondaryEmail || secondaryPhoneNumber
      ? await findMatchingContacts(companyId, secondaryEmail, secondaryPhoneNumber)
      : null;
  const secondaryDuplicate =
    secondaryDuplicateMatches?.emailMatches[0] ?? secondaryDuplicateMatches?.phoneMatches[0] ?? null;

  if (duplicate || secondaryDuplicate) {
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

  await ensureSecondaryContactIdentifiers({
    contactId: contact.id,
    primaryEmail: contact.email,
    primaryPhoneNumber: contact.phoneNumber,
    email: secondaryEmail,
    phoneNumber: secondaryPhoneNumber,
  });

  await writeAuditLog({
    companyId,
    actorUserId: auth.context!.user!.id,
    module: "contacts",
    action: "contact_created",
    entityType: "ContactMaster",
    entityId: contact.id,
    summary: `Created contact ${contact.name}`,
    afterData: {
      name: contact.name,
      email: contact.email,
      phoneNumber: contact.phoneNumber,
      secondaryEmail,
      secondaryPhoneNumber,
      recentMerchant: contact.recentMerchant,
      lastPurchaseAt: contact.lastPurchaseAt,
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
