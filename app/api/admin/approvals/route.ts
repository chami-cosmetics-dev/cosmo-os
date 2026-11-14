import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveViewerFinanceLocationIds } from "@/lib/approval-workflow";
import {
  listFinanceApprovals,
  reconcileFinanceApprovalsForList,
} from "@/lib/page-data/finance-approvals";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([
    "finance.approvals.read",
    "finance.approvals.manage",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  const userId = auth.context?.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  }

  const financeLocationIds = await resolveViewerFinanceLocationIds(
    userId,
    companyId,
    (auth.context?.roleNames as string[]) ?? []
  );

  const historyQuery = parsed.data.q?.trim() || null;
  if (historyQuery) {
    const approvals = await listFinanceApprovals({
      companyId,
      financeLocationIds,
      historyQuery,
      includePending: false,
    });
    return NextResponse.json({ approvals });
  }

  await reconcileFinanceApprovalsForList(companyId);
  const approvals = await listFinanceApprovals({ companyId, financeLocationIds });

  return NextResponse.json({ approvals });
}
