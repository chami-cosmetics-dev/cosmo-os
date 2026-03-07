"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/organisms/app-sidebar";
import { Topbar } from "@/components/organisms/topbar";

interface DashboardTemplateProps {
  children: React.ReactNode;
  title?: string;
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
}

export function DashboardTemplate({
  children,
  title = "Dashboard",
  user,
}: DashboardTemplateProps) {
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <Topbar title={title} user={user} />
        <div className="flex-1 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
