import { NextResponse } from "next/server";

import { listMerchantGroupSettings } from "@/lib/merchant-groups";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  try {
    const data = await listMerchantGroupSettings(companyId);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load merchants";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
