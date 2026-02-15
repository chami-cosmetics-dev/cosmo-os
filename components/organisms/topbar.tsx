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
  const computedTitle =
    pathname === "/dashboard/users"
      ? "User Management"
      : pathname === "/dashboard/settings"
        ? "Settings"
        : pathname === "/dashboard/profile"
          ? "Profile"
          : pathname === "/dashboard/products/items"
            ? "Product Items"
            : pathname === "/dashboard/products/vendors-categories"
              ? "Vendors & Categories"
              : title;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-6" />
      <h1 className="flex-1 text-lg font-semibold">{computedTitle}</h1>
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  );
}
