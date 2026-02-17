"use client";

import packageJson from "@/package.json";
import {
  AlertCircle,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Package,
  PackageCheck,
  Settings,
  ShoppingCart,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="font-semibold">Cosmo OS (Beta) v{packageJson.version}</span>
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
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>General Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard/settings"}>
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
                  isActive={pathname === "/dashboard/settings/sms-notifications"}
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
                <SidebarMenuButton asChild isActive={pathname === "/dashboard/orders"}>
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
          <SidebarGroupLabel>Product Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard/products/items"}>
                  <Link href="/dashboard/products/items">
                    <Package className="size-4" />
                    <span>Items</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard/products/vendors-categories"}
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
