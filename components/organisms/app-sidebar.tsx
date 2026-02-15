"use client";

import { LayoutDashboard, Mail, Settings, Users, UserCircle } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
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
          <span className="font-semibold">Cosmo OS</span>
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
              href="/dashboard/settings"
              icon={Settings}
              label="Settings"
              isActive={pathname === "/dashboard/settings"}
            />
            <NavItem
              href="/dashboard/settings/email-templates"
              icon={Mail}
              label="Email Templates"
              isActive={pathname === "/dashboard/settings/email-templates"}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
