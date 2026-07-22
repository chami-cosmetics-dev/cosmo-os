import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";

/** Status CSV import removed — Product Priority comes from ERP. */
export async function POST() {
  const auth = await requirePermission("products.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json(
    {
      error:
        "Status import is disabled. Use Sync priorities on the Items page to pull Product Priority from ERP.",
    },
    { status: 410 },
  );
}
