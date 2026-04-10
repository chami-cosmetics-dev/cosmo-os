"use client";

import packageJson from "@/package.json";
import {
  AlertCircle,
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
} from "@/components/ui/sidebar";
import { NavItem } from "@/components/molecules/nav-item";
import { UserMenu } from "@/components/molecules/user-menu";

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
  permissionKeys?: string[];
}

export function AppSidebar({ user, permissionKeys = [] }: AppSidebarProps) {
  const canCreateManualOrder = permissionKeys.includes("orders.create_manual");
  const canStickerBatch =
    permissionKeys.includes("stickers.batch.read") ||
    permissionKeys.includes("stickers.batch.manage");
  const canStickerPrint =
    permissionKeys.includes("stickers.print.read") ||
    permissionKeys.includes("stickers.print.print");
  const pathname = usePathname();

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/80 shadow-[14px_0_38px_-22px_var(--dashboard-shell-shadow)] [&_[data-sidebar=sidebar]]:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(125,88,200,0.18),transparent_34%),linear-gradient(180deg,var(--dashboard-sidebar-start),var(--dashboard-sidebar-middle),var(--dashboard-sidebar-end))] dark:[&_[data-sidebar=sidebar]]:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(162,122,221,0.18),transparent_32%),linear-gradient(180deg,var(--dashboard-sidebar-start),var(--dashboard-sidebar-middle),var(--dashboard-sidebar-end))]"
    >
      <SidebarHeader>
        <div className="rounded-2xl border border-white/35 bg-white/42 px-2 py-2 shadow-[0_16px_34px_-24px_rgba(18,32,51,0.45)] backdrop-blur-sm group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none group-data-[collapsible=icon]:px-0 dark:border-white/10 dark:bg-white/6">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <span className="text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Cosmo OS (Beta) v{packageJson.version}
          </span>
          <div className="hidden group-data-[collapsible=icon]:inline">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-sidebar-border bg-primary text-[10px] font-semibold text-primary-foreground shadow-sm">
              CO
            </span>
          </div>
        </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-3 px-2 pb-2">
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItem
              href="/dashboard"
              icon={LayoutDashboard}
              label="Dashboard"
              isActive={pathname === "/dashboard"}
            />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItem
              href="/dashboard/users"
              icon={Users}
              label="Users"
              isActive={pathname === "/dashboard/users"}
            />
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
          </SidebarGroupContent>
        </SidebarGroup>
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
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>General Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Order Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/dashboard/fulfillment")}
                >
                  <Link href="/dashboard/fulfillment/sample-free-issue">
                    <PackageCheck className="size-4" />
                    <span>Fulfillment</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard/orders/failed-webhooks"}
                >
                  <Link href="/dashboard/orders/failed-webhooks">
                    <AlertCircle className="size-4" />
                    <span>Failed Webhooks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
        <SidebarGroup>
          <SidebarGroupLabel>Product Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
