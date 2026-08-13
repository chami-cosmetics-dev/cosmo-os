import { NextRequest, NextResponse } from "next/server";

import {
  listInsightAssignedMerchantOptions,
  listInsightBrandOptions,
  listInsightCityOptions,
  listInsightItemOptions,
  listInsightPurchaseLocationOptions,
} from "@/lib/customer-insight/filter-options";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightFilterOptionsQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
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

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightFilterOptionsQuerySchema.safeParse({
    type: sp.get("type") ?? "brands",
    brand: sp.get("brand") ?? undefined,
    q: sp.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  const isAdminView = hasInsightAdminView({ roleNames, permissionKeys });

  if (parsed.data.type === "merchants" || parsed.data.type === "locations") {
    if (!isAdminView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (parsed.data.type === "items") {
    const options = await listInsightItemOptions(companyId, {
      brand: parsed.data.brand,
      q: parsed.data.q,
    });
    return NextResponse.json({ options, brands: [] });
  }

  if (parsed.data.type === "cities") {
    const options = await listInsightCityOptions(companyId, parsed.data.q);
    return NextResponse.json({ options, brands: [] });
  }

  if (parsed.data.type === "merchants") {
    const options = await listInsightAssignedMerchantOptions(
      companyId,
      parsed.data.q
    );
    return NextResponse.json({ options, brands: [] });
  }

  if (parsed.data.type === "locations") {
    const options = await listInsightPurchaseLocationOptions(
      companyId,
      parsed.data.q
    );
    return NextResponse.json({ options, brands: [] });
  }

  const options = await listInsightBrandOptions(companyId, parsed.data.q);
  return NextResponse.json({
    options,
    brands: options.map((o) => o.value),
  });
}
