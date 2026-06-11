import { NextResponse } from "next/server";

import { getOutletsByCompanyId } from "@/lib/outlet-utils";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const outlets = await getOutletsByCompanyId(companyId);
  return NextResponse.json({ outlets });
}
