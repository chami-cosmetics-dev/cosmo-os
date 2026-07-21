import { NextRequest, NextResponse } from "next/server";

import { createPerfLogger } from "@/lib/perf";
import { fetchAbandonedOrdersPageData } from "@/lib/page-data/abandoned-orders";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import {
  abandonedOrdersListQuerySchema,
} from "@/lib/validation";
import { syncAbandonedCheckoutsForCompany } from "@/lib/abandoned-checkouts-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.abandoned-orders.page-data.GET", {
    path: request.nextUrl.pathname,
  });

  const auth = await requirePermission("abandoned_orders.read");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const canManage = hasPermission(auth.context!, "abandoned_orders.manage");

  const searchParams = request.nextUrl.searchParams;
  const parsed = abandonedOrdersListQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    response: searchParams.get("response") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  const filters = parsed.success
    ? {
        from: parsed.data.from,
        to: parsed.data.to,
        followUpStatus: parsed.data.status,
        customerResponse: parsed.data.response,
        search: parsed.data.search,
        page: parsed.data.page ?? 1,
        limit: parsed.data.limit ?? 10,
      }
    : {
        from: undefined,
        to: undefined,
        followUpStatus: undefined,
        customerResponse: undefined,
        search: searchParams.get("search")?.trim() ?? undefined,
        page: 1,
        limit: 10,
      };

  perf.mark("load-sync-meta");
  const syncRow = await prisma.companyAbandonedCheckoutSync.findUnique({
    where: { companyId },
  });

  const lastSyncedAt = syncRow?.lastSyncedAt ?? null;
  const isStale = !lastSyncedAt || Date.now() - lastSyncedAt.getTime() > 30 * 60 * 1000;

  let syncedJustNow = false;
  if (isStale) {
    const syncTimeoutMs = 5000;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Sync timeout")), syncTimeoutMs)
    );

    const syncPromise = syncAbandonedCheckoutsForCompany(companyId).catch((e) => {
      throw e instanceof Error ? e : new Error(String(e));
    });

    try {
      await Promise.race([syncPromise, timeout]);
      syncedJustNow = true;
    } catch {
      // Return DB rows even when sync fails or times out.
    } finally {
      void syncPromise.catch(() => {});
    }
  }

  perf.mark("fetch-list");
  const data = await fetchAbandonedOrdersPageData({ companyId, filters });
  const syncRowAfter = await prisma.companyAbandonedCheckoutSync.findUnique({
    where: { companyId },
  });

  perf.end({
    status: 200,
    ok: true,
    page: data.pagination.page,
    limit: data.pagination.limit,
    total: data.pagination.total,
  });

  return NextResponse.json({
    items: data.items,
    pagination: data.pagination,
    sync: {
      lastSyncedAt: syncRowAfter?.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: syncRowAfter?.lastSyncError ?? null,
      syncedJustNow,
    },
    canManage,
  });
}

