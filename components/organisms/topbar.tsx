"use client";

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
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-6" />
      <h1 className="flex-1 text-lg font-semibold">{title}</h1>
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  );
}
