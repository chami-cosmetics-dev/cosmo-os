"use client";

import packageJson from "@/package.json";
import {
  AlertCircle,
  BookUser,
  ContactRound,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Package,
  PackageCheck,
  Plus,
  Printer,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sticker,
  Store,
  Tags,
  Users,
  UserCircle,
  Bike,
  FileText,
  History,
  MessageSquareWarning,
  RefreshCw,
  Calculator,
  BadgeCheck,
  GraduationCap,
  SendHorizonal,
  ClipboardList,
} from "lucide-react";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavItem } from "@/components/molecules/nav-item";
import { UserMenu } from "@/components/molecules/user-menu";
import { ALL_REPORT_DUMP_PERMISSIONS, REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";
import { APP_INITIALS, APP_NAME } from "@/lib/branding";

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
  permissionKeys?: string[];
  roleNames?: string[];
  hasOgf?: boolean;
}

export function AppSidebar({ user, permissionKeys = [], roleNames = [], hasOgf = false }: AppSidebarProps) {
  const { setOpen, state } = useSidebar();
  const hasSidebarPermission = (permission: string) =>
    roleNames.includes("super_admin") ||
    roleNames.includes("admin") ||
    permissionKeys.includes(permission);
  const canViewDashboard = hasSidebarPermission("dashboard.view");
  const canViewUsers = hasSidebarPermission("users.read");
  const canViewStaff = hasSidebarPermission("staff.read");
  const canViewOrders = hasSidebarPermission("orders.read");
  const canViewAbandonedOrders = hasSidebarPermission("abandoned_orders.read");
  const canViewContactMaster =
    hasSidebarPermission("contacts.master.read") ||
    hasSidebarPermission("contacts.read");
  const canViewContactUpdates =
    hasSidebarPermission("contacts.updates.read") ||
    hasSidebarPermission("contacts.read");
  const canViewContactAllocation =
    hasSidebarPermission("contacts.allocation.read") ||
    hasSidebarPermission("contacts.read");
  const canViewReturns = hasSidebarPermission("returns.read");
  const canViewExchanges = hasSidebarPermission("exchanges.read");
  const canViewProducts = hasSidebarPermission("products.read");
  const canViewOsf =
    hasSidebarPermission("purchasing.osf.read") ||
    hasSidebarPermission("purchasing.osf.manage");
  const canViewPurchasingTools =
    hasSidebarPermission("purchasing.tools.read") ||
    hasSidebarPermission("purchasing.tools.manage");
  const canViewPurchasing = canViewOsf || canViewPurchasingTools;
  const canViewCompanySettings = hasSidebarPermission("settings.company");
  const canViewEmailTemplates = hasSidebarPermission("settings.email_templates");
  const canViewSmsSettings = hasSidebarPermission("settings.sms_portal");
  const canViewFulfillmentSettings = hasSidebarPermission("settings.fulfillment");
  const canViewContactAllocationSettings = hasSidebarPermission(
    "contacts.allocation.settings"
  );
  const canCreateManualOrder = hasSidebarPermission("orders.create_manual");
  const canViewFailedWebhooks = hasSidebarPermission("failed_webhooks.read");
  const canStickerBatch =
    hasSidebarPermission("stickers.batch.read") ||
    hasSidebarPermission("stickers.batch.manage");
  const canStickerPrint =
    hasSidebarPermission("stickers.print.read") ||
    hasSidebarPermission("stickers.print.print");
  const canViewReports = ALL_REPORT_DUMP_PERMISSIONS.some((permission) =>
    hasSidebarPermission(permission)
  );
  const canViewUtilityDumps =
    hasSidebarPermission(REPORT_DUMP_PERMISSIONS.utilityInvoice90) ||
    hasSidebarPermission(REPORT_DUMP_PERMISSIONS.utilityInvoiceItem90);
  const canViewAudit = canViewUsers;
  const canViewComplaints =
    hasSidebarPermission("complaints.create") ||
    hasSidebarPermission("complaints.read") ||
    hasSidebarPermission("complaints.manage");
  const canViewApprovals =
    hasSidebarPermission("finance.approvals.read") ||
    hasSidebarPermission("finance.approvals.manage");
  const canViewAcademy =
    hasSidebarPermission("academy.learn") ||
    hasSidebarPermission("academy.manage");
  const canViewOutletReviews =
    hasSidebarPermission("outlets.read.all") ||
    hasSidebarPermission("outlets.read.assigned");
  const canViewMerchantReviews = hasSidebarPermission("merchant_reviews.read");
  const fulfillmentLinks = [
    {
      href: "/dashboard/fulfillment/sample-free-issue",
      permission: "fulfillment.sample_free_issue.read",
    },
    {
      href: "/dashboard/fulfillment/print",
      permission: "fulfillment.order_print.read",
    },
    {
      href: "/dashboard/fulfillment/dispatch",
      permission: "fulfillment.ready_dispatch.read",
    },
    {
      href: "/dashboard/fulfillment/delivery-invoice",
      permission: "fulfillment.delivery_invoice.read",
    },
    {
      href: "/dashboard/fulfillment/waybill-lookup",
      permission: "fulfillment.waybill_lookup.read",
    },
    {
      href: "/dashboard/fulfillment/falcon-upload",
      permission: "fulfillment.falcon_upload.read",
    },
  ];
  const fulfillmentHref = fulfillmentLinks.find((item) =>
    hasSidebarPermission(item.permission)
  )?.href;
  const canViewPeople = canViewUsers || canViewStaff;
  const canViewContacts =
    canViewContactMaster ||
    canViewContactUpdates ||
    canViewContactAllocation ||
    canViewMerchantReviews ||
    canViewOutletReviews;
  const canViewSettings =
    canViewCompanySettings ||
    canViewEmailTemplates ||
    canViewSmsSettings ||
    canViewFulfillmentSettings ||
    canViewContactAllocationSettings;
  const canViewOrderManagement =
    canViewOrders || canCreateManualOrder || canViewReturns || canViewExchanges || Boolean(fulfillmentHref);
  const canViewStickers = canStickerBatch || canStickerPrint;
  const canViewProductManagement = canViewProducts;
  const pathname = usePathname();

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/80 shadow-[14px_0_38px_-22px_var(--dashboard-shell-shadow)] [&_[data-sidebar=sidebar]]:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(125,88,200,0.18),transparent_34%),linear-gradient(180deg,var(--dashboard-sidebar-start),var(--dashboard-sidebar-middle),var(--dashboard-sidebar-end))] dark:[&_[data-sidebar=sidebar]]:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(162,122,221,0.18),transparent_32%),linear-gradient(180deg,var(--dashboard-sidebar-start),var(--dashboard-sidebar-middle),var(--dashboard-sidebar-end))]"
    >
      <SidebarHeader>
        <div className="rounded-2xl border border-white/35 bg-white/42 px-2 py-2 shadow-[0_16px_34px_-24px_rgba(18,32,51,0.45)] backdrop-blur-sm group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:border-white/10 group-data-[collapsible=icon]:bg-white/6 group-data-[collapsible=icon]:p-1 group-data-[collapsible=icon]:shadow-none dark:border-white/10 dark:bg-white/6">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <span className="text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {APP_NAME} (Beta) v{packageJson.version}
          </span>
          <button
            type="button"
            className="hidden group-data-[collapsible=icon]:inline"
            onClick={() => setOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={state === "expanded"}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-primary/90 text-[10px] font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-105">
              {APP_INITIALS}
            </span>
          </button>
        </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-3 px-2 pb-2 group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            {canViewDashboard && (
              <NavItem
                href="/dashboard"
                icon={LayoutDashboard}
                label="Dashboard"
                isActive={pathname === "/dashboard"}
              />
            )}
            {canViewComplaints && (
              <NavItem
                href="/dashboard/complaints"
                icon={MessageSquareWarning}
                label="Complaints"
                isActive={pathname === "/dashboard/complaints"}
              />
            )}
            {canViewApprovals && (
              <NavItem
                href="/dashboard/approvals"
                icon={BadgeCheck}
                label="Finance Approvals"
                isActive={pathname === "/dashboard/approvals"}
              />
            )}
            {canViewAcademy && (
              <NavItem
                href="/dashboard/cosmo-academy"
                icon={GraduationCap}
                label="Cosmo Academy"
                isActive={pathname === "/dashboard/cosmo-academy"}
              />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
        {canViewPeople && (
          <SidebarGroup>
            <SidebarGroupLabel>People</SidebarGroupLabel>
            <SidebarGroupContent>
              {canViewUsers && (
                <NavItem
                  href="/dashboard/users"
                  icon={Users}
                  label="Users"
                  isActive={pathname === "/dashboard/users"}
                />
              )}
              {canViewStaff && (
                <>
                  <NavItem
                    href="/dashboard/staff"
                    icon={UserCircle}
                    label="Staff"
                    isActive={pathname === "/dashboard/staff"}
                  />
                  <NavItem
                    href="/dashboard/riders"
                    icon={Bike}
                    label="Riders"
                    isActive={pathname === "/dashboard/riders"}
                  />
                </>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewOrderManagement && (
          <SidebarGroup>
            <SidebarGroupLabel>Order Management</SidebarGroupLabel>
            <SidebarGroupContent>
              {canViewOrders && (
                <NavItem href="/dashboard/orders" icon={ShoppingCart} label="Orders" isActive={pathname === "/dashboard/orders"} />
              )}
              {canViewAbandonedOrders && (
                <NavItem
                  href="/dashboard/orders/abandoned-orders"
                  icon={ClipboardList}
                  label="Abandoned Orders"
                  isActive={pathname === "/dashboard/orders/abandoned-orders"}
                />
              )}
              {canViewOrders && (
                <NavItem href="/dashboard/orders/pos-orders" icon={ShoppingBag} label="POS Orders" isActive={pathname === "/dashboard/orders/pos-orders"} />
              )}
              {canViewReturns && (
                <NavItem href="/dashboard/returns" icon={PackageCheck} label="Returned Orders" isActive={pathname === "/dashboard/returns"} />
              )}
              {canViewExchanges && (
                <NavItem href="/dashboard/exchanges" icon={RefreshCw} label="Exchanges" isActive={pathname === "/dashboard/exchanges"} />
              )}
              {canCreateManualOrder && (
                <NavItem href="/dashboard/orders/create" icon={Plus} label="Create Manual Order" isActive={pathname === "/dashboard/orders/create"} />
              )}
              {fulfillmentHref && (
                <NavItem href={fulfillmentHref} icon={PackageCheck} label="Fulfillment" isActive={pathname.startsWith("/dashboard/fulfillment")} />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewContacts && (
          <SidebarGroup>
            <SidebarGroupLabel>Contacts</SidebarGroupLabel>
            <SidebarGroupContent>
              {canViewContactMaster && (
                <NavItem
                  href="/dashboard/contacts"
                  icon={ContactRound}
                  label="Contact Master"
                  isActive={pathname === "/dashboard/contacts"}
                />
              )}
              {canViewContactUpdates && (
                <NavItem
                  href="/dashboard/contacts/contact-updates"
                  icon={ContactRound}
                  label="Contact Updates"
                  isActive={pathname === "/dashboard/contacts/contact-updates"}
                />
              )}
              {canViewContactAllocation && (
                <NavItem
                  href="/dashboard/contacts/allocation"
                  icon={ContactRound}
                  label="Contact Allocation"
                  isActive={pathname === "/dashboard/contacts/allocation"}
                />
              )}
              {canViewMerchantReviews && (
                <NavItem
                  href="/dashboard/contacts/reviews"
                  icon={ContactRound}
                  label="Merchant Reviews"
                  isActive={pathname === "/dashboard/contacts/reviews"}
                />
              )}
              {canViewOutletReviews && (
                <NavItem
                  href="/dashboard/contacts/outlet-reviews"
                  icon={Store}
                  label="Outlet Reviews"
                  isActive={pathname === "/dashboard/contacts/outlet-reviews"}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {(canViewReports || canViewUtilityDumps || canViewAudit || canViewFailedWebhooks) && (
          <SidebarGroup>
            <SidebarGroupLabel>Reports</SidebarGroupLabel>
            <SidebarGroupContent>
              {canViewFailedWebhooks && (
                <NavItem
                  href="/dashboard/orders/failed-webhooks"
                  icon={MessageSquareWarning}
                  label="Failed Webhooks"
                  isActive={pathname === "/dashboard/orders/failed-webhooks"}
                />
              )}
              {canViewFailedWebhooks && (
                <NavItem
                  href="/dashboard/orders/failed-erp-syncs"
                  icon={AlertCircle}
                  label="Failed ERP Syncs"
                  isActive={pathname === "/dashboard/orders/failed-erp-syncs"}
                />
              )}
              {canViewReports && (
                <NavItem
                  href="/dashboard/reports"
                  icon={FileText}
                  label="Dump Reports"
                  isActive={pathname === "/dashboard/reports" || pathname.startsWith("/dashboard/reports/")}
                />
              )}
              {canViewUtilityDumps && (
                <NavItem
                  href="/dashboard/utility-dumps"
                  icon={FileText}
                  label="Utility Dumps"
                  isActive={pathname === "/dashboard/utility-dumps"}
                />
              )}
              {canViewReports && (
                <NavItem
                  href="/dashboard/koko-tally"
                  icon={Calculator}
                  label="Koko Tally"
                  isActive={pathname === "/dashboard/koko-tally"}
                />
              )}
              {canViewAudit && (
                <NavItem
                  href="/dashboard/audit"
                  icon={History}
                  label="Audit Trail"
                  isActive={pathname === "/dashboard/audit" || pathname.startsWith("/dashboard/audit/")}
                />
              )}
              {canViewAudit && hasOgf && (
                <NavItem
                  href="/dashboard/ogf-logs"
                  icon={SendHorizonal}
                  label="OGF & Sales Logs"
                  isActive={pathname === "/dashboard/ogf-logs"}
                />
              )}
              {canViewAudit && !hasOgf && (
                <NavItem
                  href="/dashboard/sales-sms-logs"
                  icon={SendHorizonal}
                  label="Sales SMS Logs"
                  isActive={
                    pathname === "/dashboard/sales-sms-logs" ||
                    pathname.startsWith("/dashboard/sales-sms-logs/")
                  }
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewSettings && (
          <SidebarGroup>
            <SidebarGroupLabel>General Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              {canViewCompanySettings && (
                <NavItem href="/dashboard/settings" icon={Settings} label="Settings" isActive={pathname === "/dashboard/settings"} />
              )}
              {canViewEmailTemplates && (
                <NavItem href="/dashboard/settings/email-templates" icon={Mail} label="Email Templates" isActive={pathname === "/dashboard/settings/email-templates"} />
              )}
              {canViewSmsSettings && (
                <NavItem href="/dashboard/settings/sms-notifications" icon={MessageSquare} label="SMS Notifications" isActive={pathname === "/dashboard/settings/sms-notifications"} />
              )}
              {canViewFulfillmentSettings && (
                <NavItem href="/dashboard/settings/fulfillment" icon={PackageCheck} label="Fulfillment Data" isActive={pathname === "/dashboard/settings/fulfillment"} />
              )}
              {canViewContactAllocationSettings && (
                <NavItem
                  href="/dashboard/settings/contact-allocation"
                  icon={BookUser}
                  label="Contact Allocation Options"
                  isActive={pathname === "/dashboard/settings/contact-allocation"}
                />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewStickers && (
          <SidebarGroup>
            <SidebarGroupLabel>Stickers</SidebarGroupLabel>
            <SidebarGroupContent>
              {canStickerBatch && (
                <NavItem href="/dashboard/sticker-batch" icon={Sticker} label="Batch" isActive={pathname === "/dashboard/sticker-batch"} />
              )}
              {canStickerPrint && (
                <NavItem href="/dashboard/sticker-print" icon={Printer} label="Print" isActive={pathname === "/dashboard/sticker-print"} />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewProductManagement && (
          <SidebarGroup>
            <SidebarGroupLabel>Product Management</SidebarGroupLabel>
            <SidebarGroupContent>
              {canViewProducts && (
                <NavItem href="/dashboard/products/items" icon={Package} label="Items" isActive={pathname === "/dashboard/products/items"} />
              )}
              {canViewProducts && (
                <NavItem href="/dashboard/products/vendors-categories" icon={Tags} label="Vendors & Categories" isActive={pathname === "/dashboard/products/vendors-categories"} />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewPurchasing && (
          <SidebarGroup>
            <SidebarGroupLabel>Purchasing</SidebarGroupLabel>
            <SidebarGroupContent>
              {canViewOsf && (
                <NavItem href="/dashboard/purchasing/osf" icon={ClipboardList} label="Order Support File" isActive={pathname === "/dashboard/purchasing/osf"} />
              )}
              {canViewPurchasingTools && (
                <NavItem href="/dashboard/purchasing/calculator" icon={Calculator} label="SKU Calculator" isActive={pathname === "/dashboard/purchasing/calculator"} />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}


