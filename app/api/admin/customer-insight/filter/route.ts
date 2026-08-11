import { NextRequest, NextResponse } from "next/server";

import { filterAllocatedContacts } from "@/lib/customer-insight/filters";
import {
  canFilterAllInsightContacts,
  isAdminOrSuperAdmin,
} from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
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
    pushGold: sp.get("pushGold") ?? undefined,
    pushPlatinum: sp.get("pushPlatinum") ?? undefined,
    loyalty: sp.get("loyalty") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    minTotal: sp.get("minTotal") ?? undefined,
    maxTotal: sp.get("maxTotal") ?? undefined,
    birthdayThisMonth: sp.get("birthdayThisMonth") ?? undefined,
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
  const viewer = {
    knownName: user.knownName ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    roleNames,
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
    pushGold: parsed.data.pushGold,
    pushPlatinum: parsed.data.pushPlatinum,
    loyalty: parsed.data.loyalty,
    brand: parsed.data.brand,
    minTotal: parsed.data.minTotal,
    maxTotal: parsed.data.maxTotal,
    birthdayThisMonth: parsed.data.birthdayThisMonth,
    noPurchaseMonths: parsed.data.noPurchaseMonths,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return NextResponse.json(result);
}
