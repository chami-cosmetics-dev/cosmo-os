"use client";

import { usePathname } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/components/molecules/notification-bell";
import { ThemeToggle } from "@/components/molecules/theme-toggle";
import { UserMenu } from "@/components/molecules/user-menu";

interface TopbarProps {
  title?: string;
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
}

export function Topbar({ title = "Dashboard", user }: TopbarProps) {
  const pathname = usePathname();
  const titleByPrefix: Array<{ prefix: string; label: string }> = [
    { prefix: "/dashboard/users", label: "User Management" },
    { prefix: "/dashboard/staff", label: "Staff Management" },
    { prefix: "/dashboard/riders", label: "Rider Management" },
    { prefix: "/dashboard/contacts/reviews", label: "Merchant Reviews" },
    { prefix: "/dashboard/returns", label: "Returned Orders" },
    { prefix: "/dashboard/exchanges", label: "Exchanges" },
    { prefix: "/dashboard/approvals", label: "Finance Approvals" },
    { prefix: "/dashboard/complaints", label: "Complaints" },
    { prefix: "/dashboard/contacts/allocation", label: "Contact Allocation" },
    { prefix: "/dashboard/contacts", label: "Contacts" },
    { prefix: "/dashboard/reports", label: "Dump Reports" },
    { prefix: "/dashboard/koko-tally", label: "Koko Tally" },
    { prefix: "/dashboard/audit", label: "Audit Trail" },
    { prefix: "/dashboard/orders/create", label: "Create Manual Order" },
    { prefix: "/dashboard/orders/failed-webhooks", label: "Failed Webhooks" },
    { prefix: "/dashboard/orders", label: "Orders" },
    { prefix: "/dashboard/settings/email-templates", label: "Email Templates" },
    { prefix: "/dashboard/settings/sms-notifications", label: "SMS Notifications" },
    { prefix: "/dashboard/settings/fulfillment", label: "Fulfillment Settings" },
    { prefix: "/dashboard/settings", label: "Settings" },
    { prefix: "/dashboard/profile", label: "Profile" },
    { prefix: "/dashboard/products/items", label: "Product Items" },
    { prefix: "/dashboard/products/vendors-categories", label: "Vendors & Categories" },
    { prefix: "/dashboard/sticker-batch", label: "Sticker Batch" },
    { prefix: "/dashboard/sticker-print", label: "Sticker Print" },
    { prefix: "/dashboard/fulfillment", label: "Fulfillment" },
    { prefix: "/dashboard/cosmo-academy", label: "Cosmo Academy" },
  ];
  const matched = titleByPrefix.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  const computedTitle = matched?.label ?? title;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/90 px-4 text-foreground shadow-[0_1px_0_0_color-mix(in_srgb,var(--border)_60%,transparent)] backdrop-blur-md">
      <SidebarTrigger className="-ml-1 size-8 rounded-lg border border-border/60 bg-background/80 text-muted-foreground hover:bg-accent/60 hover:text-foreground" />
      <Separator orientation="vertical" className="h-5 bg-border/60" />
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span className="hidden text-xs text-muted-foreground sm:block shrink-0">Cosmo OS</span>
        <span className="hidden text-xs text-muted-foreground/50 sm:block shrink-0">/</span>
        <h1 className="truncate text-[15px] font-semibold text-foreground">{computedTitle}</h1>
      </div>
      <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/70 px-1 py-1">
        <NotificationBell />
        <ThemeToggle />
        <div className="mx-0.5 h-5 w-px bg-border/60" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

