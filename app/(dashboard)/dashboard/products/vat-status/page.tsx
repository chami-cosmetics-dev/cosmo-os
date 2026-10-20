import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { GiftVouchersPanel } from "@/components/organisms/gift-vouchers-panel";
import { VatStatusPanel } from "@/components/organisms/vat-status-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GIFT_VOUCHER_MANAGE_PERMISSION,
  GIFT_VOUCHER_READ_PERMISSION,
} from "@/lib/gift-vouchers/types";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { VAT_STATUS_PERMISSION } from "@/lib/vat-status/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function VatStatusPage({ searchParams }: PageProps) {
  const context = await getCurrentUserContext();
  if (!context?.user) redirect("/login");

  const canViewVat = hasPermission(context, VAT_STATUS_PERMISSION);
  const canManageVouchers = hasPermission(context, GIFT_VOUCHER_MANAGE_PERMISSION);
  const canViewVouchers = canManageVouchers || hasPermission(context, GIFT_VOUCHER_READ_PERMISSION);

  if (!canViewVat && !canViewVouchers) {
    return (
      <div className="p-4 md:p-6">
        <PermissionDeniedCard
          title="VAT status"
          message="You need products.vat_status.read or products.gift_vouchers.read to open this page. Ask an administrator to grant it."
        />
      </div>
    );
  }

  const { tab } = await searchParams;
  const defaultTab = !canViewVat || (tab === "gift-vouchers" && canViewVouchers) ? "gift-vouchers" : "vat-status";

  return (
    <div className="p-4 md:p-6">
      <Tabs defaultValue={defaultTab} className="gap-6">
        <TabsList>
          {canViewVat ? <TabsTrigger value="vat-status">VAT Status</TabsTrigger> : null}
          {canViewVouchers ? <TabsTrigger value="gift-vouchers">Gift Vouchers</TabsTrigger> : null}
        </TabsList>
        {canViewVat ? (
          <TabsContent value="vat-status">
            <VatStatusPanel />
          </TabsContent>
        ) : null}
        {canViewVouchers ? (
          <TabsContent value="gift-vouchers">
            <GiftVouchersPanel canManage={canManageVouchers} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
