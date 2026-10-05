import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { loadPurchaseHistory } from "@/lib/vault-osf/purchase-history-load";
import { paginateRows } from "@/lib/vault-osf/purchase-history-dashboard";
import { purchaseHistoryQuerySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(context, "purchasing.purchase_history.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = purchaseHistoryQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const query = parsed.data;
  if (query.from > query.to) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }

  const loaded = await loadPurchaseHistory(companyId, query);
  const page = paginateRows(loaded.rows, query.offset, query.limit);

  return NextResponse.json({
    rows: page,
    summary: loaded.summary,
    total: loaded.rows.length,
    offset: query.offset,
    limit: query.limit,
    erpAvailable: loaded.erpAvailable,
    erpError: loaded.erpError,
    filterOptions: loaded.filterOptions,
  });
}
