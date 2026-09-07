import { NextResponse } from "next/server";

import {
  listMerchantAllocationCounts,
  listMerchantPurchaseCountSummary,
  type PurchaseCountFilter,
} from "@/lib/customer-insight/allocation-summary";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";

function parseDateRange(
  searchParams: URLSearchParams
): { from: Date; to: Date } | null {
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  if (!fromRaw || !toRaw) return null;

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

function parsePurchaseCountFilter(
  searchParams: URLSearchParams
): PurchaseCountFilter {
  const preset = searchParams.get("purchasePreset");

  if (preset === "custom") {
    const fromRaw = searchParams.get("purchaseFrom");
    const toRaw = searchParams.get("purchaseTo");
    if (fromRaw && toRaw) {
      const from = new Date(fromRaw);
      const to = new Date(toRaw);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        to.setUTCHours(23, 59, 59, 999);
        return { preset: "custom", from, to };
      }
    }
  } else if (
    preset === "today" ||
    preset === "1-30" ||
    preset === "31-90" ||
    preset === "91-180" ||
    preset === "181-365" ||
    preset === "over-365"
  ) {
    return { preset };
  }

  return { preset: "today" };
}

export async function GET(request: Request) {
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

  const roleNames = (auth.context!.roleNames as string[]) ?? [];
  const permissionKeys = (auth.context!.permissionKeys as string[]) ?? [];
  if (!hasInsightAdminView({ roleNames, permissionKeys })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dateRange = parseDateRange(searchParams);
  const purchaseCountFilter = parsePurchaseCountFilter(searchParams);

  const [summary, purchaseCountSummary] = await Promise.all([
    listMerchantAllocationCounts(companyId, dateRange ?? undefined),
    listMerchantPurchaseCountSummary(companyId, purchaseCountFilter),
  ]);

  return NextResponse.json({ ...summary, purchaseCount: purchaseCountSummary });
}