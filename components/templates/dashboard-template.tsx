"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/organisms/app-sidebar";
import { Topbar } from "@/components/organisms/topbar";
import { ConfirmationDialogProvider } from "@/components/providers/confirmation-dialog-provider";

interface DashboardTemplateProps {
  children: React.ReactNode;
  title?: string;
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
  permissionKeys?: string[];
}

export function DashboardTemplate({
  children,
  title = "Dashboard",
  user,
  permissionKeys = [],
}: DashboardTemplateProps) {
  return (
    <ConfirmationDialogProvider>
      <SidebarProvider>
        <AppSidebar user={user} permissionKeys={permissionKeys} />
        <SidebarInset className="bg-[radial-gradient(circle_at_top_right,var(--dashboard-surface-glow),transparent_28%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_88%,white))] dark:bg-[radial-gradient(circle_at_top_right,var(--dashboard-surface-glow),transparent_24%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_92%,black))]">
          <Topbar title={title} user={user} />
          <div className="flex-1 p-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ConfirmationDialogProvider>
  );
}
