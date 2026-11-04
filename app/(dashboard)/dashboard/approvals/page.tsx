import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { FinanceApprovalsPanel } from "@/components/organisms/finance-approvals-panel";
import { resolveViewerFinanceLocationIds } from "@/lib/approval-workflow";
import { FINANCE_CANCEL_KOKO_DUPLICATE_PERMISSION } from "@/lib/koko-order";
import {
  listFinanceApprovals,
  reconcileFinanceApprovalsForList,
} from "@/lib/page-data/finance-approvals";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FinanceApprovalsPage() {
  const auth = await requireAnyPermission([
    "finance.approvals.read",
    "finance.approvals.manage",
  ]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context?.user?.companyId;
  const userId = auth.context?.user?.id;
  if (!companyId || !userId) {
    return (
      <PermissionDeniedCard message="No company associated with your account." />
    );
  }

  await reconcileFinanceApprovalsForList(companyId);

  const financeLocationIds = await resolveViewerFinanceLocationIds(
    userId,
    companyId,
    (auth.context?.roleNames as string[]) ?? [],
  );
  const approvals = await listFinanceApprovals({
    companyId,
    financeLocationIds,
  });
  const canRevertPaid = hasPermission(
    auth.context!,
    "finance.hod.revert_paid_to_unpaid",
  );
  const canCancelKokoDuplicate = hasPermission(
    auth.context!,
    FINANCE_CANCEL_KOKO_DUPLICATE_PERMISSION,
  );
  return (
    <FinanceApprovalsPanel
      initialApprovals={approvals}
      canRevertPaid={canRevertPaid}
      canCancelKokoDuplicate={canCancelKokoDuplicate}
    />
  );
}
