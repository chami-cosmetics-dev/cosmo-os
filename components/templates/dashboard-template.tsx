"use client";

import { LogOut } from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/organisms/app-sidebar";
import { Topbar } from "@/components/organisms/topbar";
import { ConfirmationDialogProvider } from "@/components/providers/confirmation-dialog-provider";
import { APP_NAME } from "@/lib/branding";

interface DashboardTemplateProps {
  children: React.ReactNode;
  title?: string;
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
  permissionKeys?: string[];
  roleNames?: string[];
  seoOnly?: boolean;
}

export function DashboardTemplate({
  children,
  title = "Dashboard",
  user,
  permissionKeys = [],
  roleNames = [],
  seoOnly = false,
}: DashboardTemplateProps) {
  if (seoOnly) {
    return (
      <ConfirmationDialogProvider>
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,var(--dashboard-surface-glow),transparent_28%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_88%,white))] p-6 text-foreground dark:bg-[radial-gradient(circle_at_top_right,var(--dashboard-surface-glow),transparent_24%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_92%,black))]">
          <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center justify-center">
            <div className="w-full rounded-2xl border border-border/70 bg-card/80 p-8 text-center shadow-[0_18px_40px_-28px_var(--primary)] backdrop-blur sm:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {APP_NAME}
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Hello, welcome to {APP_NAME}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                {user.name || user.email || "SEO team"}
              </p>
              <a
                href="/auth/logout"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/80 px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary/40"
              >
                <LogOut className="size-4" />
                Log out
              </a>
            </div>
          </section>
        </main>
      </ConfirmationDialogProvider>
    );
  }

  return (
    <ConfirmationDialogProvider>
      <SidebarProvider>
        <AppSidebar user={user} permissionKeys={permissionKeys} roleNames={roleNames} />
        <SidebarInset className="min-w-0 bg-[radial-gradient(circle_at_top_right,var(--dashboard-surface-glow),transparent_28%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_88%,white))] dark:bg-[radial-gradient(circle_at_top_right,var(--dashboard-surface-glow),transparent_24%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_92%,black))]">
          <Topbar title={title} user={user} />
          <div className="min-w-0 flex-1 p-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ConfirmationDialogProvider>
  );
}
