import { NextRequest, NextResponse } from "next/server";

import {
  buildCallQueueAssignmentsWorkbook,
  buildCallQueueFilteredContactsWorkbook,
} from "@/lib/customer-insight/call-queue-export";
import { readInsightFilterList } from "@/lib/customer-insight/filter-query-params";
import { hasInsightAdminView } from "@/lib/customer-insight/ownership";
import { requirePermission } from "@/lib/rbac";
import { customerInsightCallQueueExportQuerySchema } from "@/lib/validation/customer-insight";

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
  const parsed = customerInsightCallQueueExportQuerySchema.safeParse({
    assignedMerchant: sp.get("assignedMerchant") ?? undefined,
    kind: sp.get("kind") ?? undefined,
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
    brand: readInsightFilterList(sp, "brand"),
    hideFilter: sp.get("hideFilter") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { buffer, filename } =
    parsed.data.kind === "filtered"
      ? await buildCallQueueFilteredContactsWorkbook({
          companyId,
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
          brands: parsed.data.brand,
          hideFilter: parsed.data.hideFilter,
        })
      : await buildCallQueueAssignmentsWorkbook({
          companyId,
          assignedMerchant: parsed.data.assignedMerchant,
        });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
