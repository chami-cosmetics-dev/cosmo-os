"use client";

import { usePathname } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
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
    { prefix: "/dashboard/contacts", label: "Contacts" },
    { prefix: "/dashboard/orders/create", label: "Create manual order" },
    { prefix: "/dashboard/orders", label: "Orders" },
    { prefix: "/dashboard/settings", label: "Settings" },
    { prefix: "/dashboard/profile", label: "Profile" },
    { prefix: "/dashboard/products/items", label: "Product Items" },
    { prefix: "/dashboard/products/vendors-categories", label: "Vendors & Categories" },
    { prefix: "/dashboard/sticker-batch", label: "Sticker Batch" },
    { prefix: "/dashboard/sticker-print", label: "Sticker Print" },
    { prefix: "/dashboard/fulfillment", label: "Fulfillment" },
  ];
  const matched = titleByPrefix.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  const computedTitle = matched?.label ?? title;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-[linear-gradient(100deg,color-mix(in_srgb,var(--background)_86%,white),var(--dashboard-bar-start),var(--dashboard-bar-middle),var(--dashboard-bar-end))] px-4 text-foreground shadow-[0_12px_24px_-26px_var(--primary)] backdrop-blur before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,var(--dashboard-bar-highlight),transparent_34%)]">
      <SidebarTrigger className="-ml-1 border border-border/60 bg-background/75 text-primary hover:bg-secondary/45 hover:text-primary" />
      <Separator orientation="vertical" className="mr-1 h-6 bg-border/80" />
      <div className="flex flex-1 items-center gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold tracking-[0.24em] text-muted-foreground uppercase">
            Cosmo OS
          </span>
          <h1 className="text-lg font-semibold text-foreground">{computedTitle}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="[&_button]:border [&_button]:border-border/60 [&_button]:bg-background/70 [&_button]:text-foreground [&_button]:hover:bg-secondary/40">
          <ThemeToggle />
        </div>
        <div className="[&_button]:rounded-xl [&_button]:border [&_button]:border-border/60 [&_button]:bg-background/70 [&_button]:px-2 [&_button]:text-foreground [&_button]:hover:bg-secondary/35">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
