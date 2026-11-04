import { redirect } from "next/navigation";

import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { GiftVouchersPanel } from "@/components/organisms/gift-vouchers-panel";
import { OrderAvailabilityPanel } from "@/components/organisms/order-availability-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GIFT_VOUCHER_MANAGE_PERMISSION,
  GIFT_VOUCHER_READ_PERMISSION,
} from "@/lib/gift-vouchers/types";
import {
  ORDER_AVAILABILITY_MANAGE_PERMISSION,
  ORDER_AVAILABILITY_PERMISSION,
} from "@/lib/order-availability/types";
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
  const canManagePriority = hasPermission(context, ORDER_AVAILABILITY_MANAGE_PERMISSION);
  const canViewOrderAvailability =
    canManagePriority ||
    hasPermission(context, ORDER_AVAILABILITY_PERMISSION) ||
    canViewVat;

  if (!canViewVouchers && !canViewOrderAvailability) {
    return (
      <div className="p-4 md:p-6">
        <PermissionDeniedCard
          title="Order availability"
          message="You need products.order_availability.read, products.vat_status.read, or products.gift_vouchers.read to open this page. Ask an administrator to grant it."
        />
      </div>
    );
  }

  const { tab } = await searchParams;
  const permittedTabs = [
    canViewOrderAvailability ? "order-availability" : null,
    canViewVouchers ? "gift-vouchers" : null,
  ].filter((value): value is string => Boolean(value));
  const defaultTab =
    tab && permittedTabs.includes(tab) ? tab : (permittedTabs[0] ?? "order-availability");

  return (
    <div className="p-4 md:p-6">
      <Tabs defaultValue={defaultTab} className="gap-6">
        <TabsList>
          {canViewOrderAvailability ? (
            <TabsTrigger value="order-availability">Order Availability</TabsTrigger>
          ) : null}
          {canViewVouchers ? <TabsTrigger value="gift-vouchers">Gift Vouchers</TabsTrigger> : null}
        </TabsList>
        {canViewOrderAvailability ? (
          <TabsContent value="order-availability">
            <OrderAvailabilityPanel canManage={canManagePriority} />
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
