import { NextRequest, NextResponse } from "next/server";

import { listCallQueueCandidates } from "@/lib/customer-insight/call-queue";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { readInsightFilterList } from "@/lib/customer-insight/filter-query-params";
import { requirePermission } from "@/lib/rbac";
import { customerInsightCallQueueCandidatesQuerySchema } from "@/lib/validation/customer-insight";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("contacts.insight.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsed = customerInsightCallQueueCandidatesQuerySchema.safeParse({
    assignedMerchant: sp.get("assignedMerchant") ?? undefined,
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
    pushToGold: sp.get("pushToGold") ?? undefined,
    pushToPlatinum: sp.get("pushToPlatinum") ?? undefined,
    loyalty: sp.get("loyalty") ?? undefined,
    lastPurchaseFrom: sp.get("lastPurchaseFrom") ?? undefined,
    lastPurchaseTo: sp.get("lastPurchaseTo") ?? undefined,
    allocatedFrom: sp.get("allocatedFrom") ?? undefined,
    allocatedTo: sp.get("allocatedTo") ?? undefined,
    assignedFrom: sp.get("assignedFrom") ?? undefined,
    assignedTo: sp.get("assignedTo") ?? undefined,
    notContacted: sp.get("notContacted") ?? undefined,
    notInterestedInLoyalty: sp.get("notInterestedInLoyalty") ?? undefined,
    brand: readInsightFilterList(sp, "brand"),
    hideFilter: sp.get("hideFilter") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await listCallQueueCandidates({
      companyId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      merchantValue: parsed.data.assignedMerchant,
      pushToGold: parsed.data.pushToGold,
      pushToPlatinum: parsed.data.pushToPlatinum,
      loyalty: parsed.data.loyalty,
      lastPurchaseFrom: parsed.data.lastPurchaseFrom,
      lastPurchaseTo: parsed.data.lastPurchaseTo,
      allocatedFrom: parsed.data.allocatedFrom,
      allocatedTo: parsed.data.allocatedTo,
      assignedFrom: parsed.data.assignedFrom,
      assignedTo: parsed.data.assignedTo,
      notContacted: parsed.data.notContacted,
      notInterestedInLoyalty: parsed.data.notInterestedInLoyalty,
      brands: parsed.data.brand,
      hideFilter: parsed.data.hideFilter,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[call-queue/candidates]", error);
    const message =
      error instanceof Error ? error.message : "Failed to load allocated contacts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
