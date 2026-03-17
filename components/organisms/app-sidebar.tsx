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
import { useState } from "react";

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
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const [showCollapsedLogo, setShowCollapsedLogo] = useState(true);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Cosmo OS (Beta) v{packageJson.version}
          </span>
          <div className="hidden group-data-[collapsible=icon]:inline">
            {showCollapsedLogo ? (
              <img
                src="/api/favicon"
                alt="Cosmo OS logo"
                className="size-8 shrink-0 rounded-sm object-contain"
                onError={() => setShowCollapsedLogo(false)}
              />
            ) : (
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border text-[10px] font-semibold">
                CO
              </span>
            )}
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
