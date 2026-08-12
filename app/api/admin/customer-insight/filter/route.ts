import { NextRequest, NextResponse } from "next/server";

import { filterAllocatedContacts } from "@/lib/customer-insight/filters";
import {
  canFilterAllInsightContacts,
  hasInsightAdminView,
} from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { customerInsightFilterQuerySchema } from "@/lib/validation/customer-insight";

function queryParam(value: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
}

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
    brand: queryParam(sp.get("brand")),
    item: queryParam(sp.get("item")),
    minTotal: queryParam(sp.get("minTotal")),
    maxTotal: queryParam(sp.get("maxTotal")),
    birthdayFrom: queryParam(sp.get("birthdayFrom")),
    birthdayTo: queryParam(sp.get("birthdayTo")),
    lastContactedFrom: queryParam(sp.get("lastContactedFrom")),
    lastContactedTo: queryParam(sp.get("lastContactedTo")),
    loyaltyRegisteredFrom: queryParam(sp.get("loyaltyRegisteredFrom")),
    loyaltyRegisteredTo: queryParam(sp.get("loyaltyRegisteredTo")),
    noPurchaseFrom: queryParam(sp.get("noPurchaseFrom")),
    noPurchaseTo: queryParam(sp.get("noPurchaseTo")),
    noPurchaseMonths: queryParam(sp.get("noPurchaseMonths")),
    page: queryParam(sp.get("page")),
    pageSize: queryParam(sp.get("pageSize")),
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
    isAdmin: hasInsightAdminView({ roleNames, permissionKeys }),
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
