import { NextResponse } from "next/server";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET() {
  if (!isVaultOsDeployment()) return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  const auth = await requireAnyPermission([ITEM_CREATION_PERMISSIONS.admin, ITEM_CREATION_PERMISSIONS.manageAll]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const companyId = auth.context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "Company is required" }, { status: 400 });
  try {
    const instances = await getAllOsfErpInstances(companyId);
    const selected = instances.filter((instance) => /erp[_\s-]*[12]\b/i.test(instance.label ?? ""));
    if (selected.length === 0) throw new Error("No ERP instance is configured");
    const lists = await Promise.all(selected.map(async (instance) => {
      const response = await fetch(`${instance.cfg.baseUrl}/api/resource/Custom%20Field/Item-custom_country_claim_type`, {
        headers: { Authorization: `token ${instance.cfg.apiKey}:${instance.cfg.apiSecret}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Could not load Country Claim Type options from ${instance.label}`);
      const payload = await response.json() as { data?: { options?: string } };
      const field = payload.data;
      if (!field) throw new Error(`Country Claim Type field is missing in ${instance.label}`);
      return (field.options ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    }));
    return NextResponse.json({ options: [...new Set(lists.flat())] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Country Claim Type options" }, { status: 502 });
  }
}
