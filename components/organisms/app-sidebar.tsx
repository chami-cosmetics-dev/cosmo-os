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
      className="border-r border-sidebar-border/70 [&_[data-sidebar=sidebar]]:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sidebar)_94%,white),var(--sidebar),color-mix(in_srgb,var(--accent)_8%,var(--sidebar)))] dark:[&_[data-sidebar=sidebar]]:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sidebar)_96%,black),var(--sidebar),color-mix(in_srgb,var(--accent)_6%,var(--sidebar)))]"
    >
      <SidebarHeader>
        <div className="rounded-xl bg-secondary/18 px-2 py-2 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0">
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
        <div className="mx-2 rounded-2xl border border-sidebar-border/70 bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(14,165,164,0.06),rgba(245,158,11,0.08))] px-3 py-3 shadow-[0_12px_24px_-28px_var(--primary)] group-data-[collapsible=icon]:hidden">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-sidebar-foreground/70 uppercase">
            Palette
          </p>
          <p className="mt-1 text-xs text-sidebar-foreground/80">
            Blue for structure, teal for freshness, amber for highlights.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <span className="h-3 w-3 rounded-full bg-[var(--chart-2)]" />
            <span className="h-3 w-3 rounded-full bg-[var(--chart-3)]" />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
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
              href="/dashboard/contacts"
              icon={ContactRound}
              label="Contacts"
              isActive={pathname === "/dashboard/contacts"}
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
