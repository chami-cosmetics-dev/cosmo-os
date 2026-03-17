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
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-6" />
      <h1 className="flex-1 text-lg font-semibold">{computedTitle}</h1>
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  );
}
