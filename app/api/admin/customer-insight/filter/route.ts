import { NextRequest, NextResponse } from "next/server";

import { filterAllocatedContacts } from "@/lib/customer-insight/filters";
import {
  canFilterAllInsightContacts,
  isAdminOrSuperAdmin,
} from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { customerInsightFilterQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const user = auth.context!.user;
  if (!companyId || !user) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightFilterQuerySchema.safeParse({
    brand: sp.get("brand") ?? undefined,
    item: sp.get("item") ?? undefined,
    minTotal: sp.get("minTotal") ?? undefined,
    maxTotal: sp.get("maxTotal") ?? undefined,
    birthdayFrom: sp.get("birthdayFrom") ?? undefined,
    birthdayTo: sp.get("birthdayTo") ?? undefined,
    lastContactedFrom: sp.get("lastContactedFrom") ?? undefined,
    lastContactedTo: sp.get("lastContactedTo") ?? undefined,
    loyaltyRegisteredFrom: sp.get("loyaltyRegisteredFrom") ?? undefined,
    loyaltyRegisteredTo: sp.get("loyaltyRegisteredTo") ?? undefined,
    noPurchaseFrom: sp.get("noPurchaseFrom") ?? undefined,
    noPurchaseTo: sp.get("noPurchaseTo") ?? undefined,
    noPurchaseMonths: sp.get("noPurchaseMonths") ?? undefined,
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { couponCodes: true },
  });
  const viewer = {
    knownName: user.knownName ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    roleNames,
    couponCodes: dbUser?.couponCodes ?? null,
  };

  const scopeAllContacts = canFilterAllInsightContacts({
    roleNames,
    permissionKeys,
  });

  const result = await filterAllocatedContacts({
    companyId,
    viewer,
    isAdmin: isAdminOrSuperAdmin(roleNames),
    scopeAllContacts,
    brand: parsed.data.brand,
    item: parsed.data.item,
    minTotal: parsed.data.minTotal,
    maxTotal: parsed.data.maxTotal,
    birthdayFrom: parsed.data.birthdayFrom,
    birthdayTo: parsed.data.birthdayTo,
    lastContactedFrom: parsed.data.lastContactedFrom,
    lastContactedTo: parsed.data.lastContactedTo,
    loyaltyRegisteredFrom: parsed.data.loyaltyRegisteredFrom,
    loyaltyRegisteredTo: parsed.data.loyaltyRegisteredTo,
    noPurchaseFrom: parsed.data.noPurchaseFrom,
    noPurchaseTo: parsed.data.noPurchaseTo,
    noPurchaseMonths: parsed.data.noPurchaseMonths,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return NextResponse.json(result);
}
