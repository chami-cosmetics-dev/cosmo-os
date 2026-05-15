"use client";

import packageJson from "@/package.json";
import {
  ContactRound,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Package,
  PackageCheck,
  Plus,
  Printer,
  Settings,
  ShoppingCart,
  Sticker,
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
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavItem } from "@/components/molecules/nav-item";
import { UserMenu } from "@/components/molecules/user-menu";
import { ALL_REPORT_DUMP_PERMISSIONS } from "@/lib/report-permissions";

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
  permissionKeys?: string[];
  roleNames?: string[];
}

export function AppSidebar({ user, permissionKeys = [], roleNames = [] }: AppSidebarProps) {
  const { setOpen, state } = useSidebar();
  const hasSidebarPermission = (permission: string) =>
    roleNames.includes("super_admin") ||
    roleNames.includes("admin") ||
    permissionKeys.includes(permission);
  const canViewUsers = hasSidebarPermission("users.read");
  const canViewStaff = hasSidebarPermission("staff.read");
  const canViewOrders = hasSidebarPermission("orders.read");
  const canViewReturns = hasSidebarPermission("returns.read");
  const canViewExchanges = hasSidebarPermission("exchanges.read");
  const canViewProducts = hasSidebarPermission("products.read");
  const canViewCompanySettings = hasSidebarPermission("settings.company");
  const canViewEmailTemplates = hasSidebarPermission("settings.email_templates");
  const canViewSmsSettings = hasSidebarPermission("settings.sms_portal");
  const canViewFulfillmentSettings = hasSidebarPermission("settings.fulfillment");
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
  const canViewAudit = canViewUsers;
  const canViewComplaints =
    hasSidebarPermission("complaints.create") ||
    hasSidebarPermission("complaints.read") ||
    hasSidebarPermission("complaints.manage");
  const canViewApprovals =
    hasSidebarPermission("finance.approvals.read") ||
    hasSidebarPermission("finance.approvals.manage");
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
  const canViewContacts = canViewOrders;
  const canViewSettings =
    canViewCompanySettings ||
    canViewEmailTemplates ||
    canViewSmsSettings ||
    canViewFulfillmentSettings;
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
            Cosmo OS (Beta) v{packageJson.version}
          </span>
          <button
            type="button"
            className="hidden group-data-[collapsible=icon]:inline"
            onClick={() => setOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={state === "expanded"}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-primary/90 text-[10px] font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-105">
              CO
            </span>
          </button>
        </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-3 px-2 pb-2 group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItem
              href="/dashboard"
              icon={LayoutDashboard}
              label="Dashboard"
              isActive={pathname === "/dashboard"}
            />
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
        {canViewContacts && (
          <SidebarGroup>
            <SidebarGroupLabel>Contacts</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavItem
                href="/dashboard/contacts"
                icon={ContactRound}
                label="Contact Master"
                isActive={pathname === "/dashboard/contacts"}
              />
              <NavItem
                href="/dashboard/contacts/allocation"
                icon={ContactRound}
                label="Contact Allocation"
                isActive={pathname === "/dashboard/contacts/allocation"}
              />
              <NavItem
                href="/dashboard/contacts/reviews"
                icon={ContactRound}
                label="Merchant Reviews"
                isActive={pathname === "/dashboard/contacts/reviews"}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {(canViewReports || canViewAudit || canViewFailedWebhooks) && (
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
              {canViewReports && (
                <NavItem
                  href="/dashboard/reports"
                  icon={FileText}
                  label="Dump Reports"
                  isActive={pathname === "/dashboard/reports" || pathname.startsWith("/dashboard/reports/")}
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
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewSettings && (
          <SidebarGroup>
            <SidebarGroupLabel>General Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canViewCompanySettings && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/dashboard/settings"}
                    >
                      <Link href="/dashboard/settings">
                        <Settings className="size-4" />
                        <span>Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewEmailTemplates && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/dashboard/settings/email-templates"}
                    >
                      <Link href="/dashboard/settings/email-templates">
                        <Mail className="size-4" />
                        <span>Email Templates</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewSmsSettings && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        pathname === "/dashboard/settings/sms-notifications"
                      }
                    >
                      <Link href="/dashboard/settings/sms-notifications">
                        <MessageSquare className="size-4" />
                        <span>SMS Notifications</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewFulfillmentSettings && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/dashboard/settings/fulfillment"}
                    >
                      <Link href="/dashboard/settings/fulfillment">
                        <PackageCheck className="size-4" />
                        <span>Fulfillment Data</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewOrderManagement && (
          <SidebarGroup>
            <SidebarGroupLabel>Order Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canViewOrders && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/dashboard/orders"}
                    >
                      <Link href="/dashboard/orders">
                        <ShoppingCart className="size-4" />
                        <span>Orders</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewReturns && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/dashboard/returns"}
                    >
                      <Link href="/dashboard/returns">
                        <PackageCheck className="size-4" />
                        <span>Returned Orders</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewExchanges && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/dashboard/exchanges"}
                    >
                      <Link href="/dashboard/exchanges">
                        <RefreshCw className="size-4" />
                        <span>Exchanges</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              {canCreateManualOrder && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/dashboard/orders/create"}
                  >
                    <Link href="/dashboard/orders/create">
                      <Plus className="size-4" />
                      <span>Create manual order</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {fulfillmentHref && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/dashboard/fulfillment")}
                  >
                    <Link href={fulfillmentHref}>
                      <PackageCheck className="size-4" />
                      <span>Fulfillment</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewStickers && (
          <SidebarGroup>
            <SidebarGroupLabel>Stickers</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
              {canStickerBatch && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/dashboard/sticker-batch"}
                  >
                    <Link href="/dashboard/sticker-batch">
                      <Sticker className="size-4" />
                      <span>Batch</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {canStickerPrint && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/dashboard/sticker-print"}
                  >
                    <Link href="/dashboard/sticker-print">
                      <Printer className="size-4" />
                      <span>Print</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {canViewProductManagement && (
          <SidebarGroup>
            <SidebarGroupLabel>Product Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canViewProducts && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/dashboard/products/items"}
                    >
                      <Link href="/dashboard/products/items">
                        <Package className="size-4" />
                        <span>Items</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewProducts && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        pathname === "/dashboard/products/vendors-categories"
                      }
                    >
                      <Link href="/dashboard/products/vendors-categories">
                        <Tags className="size-4" />
                        <span>Vendors & Categories</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
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



