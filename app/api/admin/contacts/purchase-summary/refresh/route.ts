import { NextResponse } from "next/server";

import {
  getPurchaseSummarySyncStatus,
  refreshCompanyPurchaseSummaries,
} from "@/lib/contacts/purchase-summary-cache";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function GET() {
  const auth = await requirePermission("contacts.master.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const status = await getPurchaseSummarySyncStatus(companyId);
  return NextResponse.json(status);
}

/** Manual rebuild of purchase-summary cache used by Contact Master export. */
export async function POST() {
  const auth = await requirePermission("contacts.master.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  try {
    const result = await refreshCompanyPurchaseSummaries(companyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to refresh purchase summary cache",
      },
      { status: 500 }
    );
  }
}
