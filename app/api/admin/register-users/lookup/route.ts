import { NextRequest, NextResponse } from "next/server";

import { findMatchingContacts } from "@/lib/contact-identifiers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { RegisterPhoneConflictError } from "@/lib/register-users/types";
import { registerUsersLookupQuerySchema } from "@/lib/validation/register-users";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.register");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const parsed = registerUsersLookupQuerySchema.safeParse({
    phone: request.nextUrl.searchParams.get("phone") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { phoneMatches } = await findMatchingContacts(
    companyId,
    null,
    parsed.data.phone,
  );
  const uniqueIds = [...new Set(phoneMatches.map((c) => c.id))];
  if (uniqueIds.length > 1) {
    const conflict = new RegisterPhoneConflictError(
      phoneMatches.map((c) => ({
        contactId: c.id,
        name: c.name,
        email: c.email,
        phone: c.phoneNumber,
      })),
    );
    return NextResponse.json(
      { error: conflict.message, matches: conflict.matches },
      { status: 409 },
    );
  }

  if (uniqueIds.length === 0) {
    return NextResponse.json({ match: null });
  }

  const contact = await prisma.contactMaster.findFirst({
    where: { id: uniqueIds[0], companyId },
    select: {
      id: true,
      name: true,
      email: true,
      birthYear: true,
      birthMonth: true,
      birthDay: true,
    },
  });
  if (!contact) {
    return NextResponse.json({ match: null });
  }

  return NextResponse.json({
    match: {
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
      birthYear: contact.birthYear,
      birthMonth: contact.birthMonth,
      birthDay: contact.birthDay,
    },
  });
}
