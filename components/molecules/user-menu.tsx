"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut, User } from "lucide-react";

import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  user: {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserMenu({ user }: UserMenuProps) {
  const { confirm } = useConfirmationDialog();

  async function handleLogout(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const confirmed = await confirm({
      title: "Log out?",
      description: "Are you sure you want to log out of your account?",
      confirmLabel: "Log Out",
      variant: "destructive",
    });
    if (!confirmed) return;
    window.location.href = "/auth/logout";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-2 py-1.5 outline-none ring-sidebar-ring transition-colors hover:bg-secondary/10 hover:text-foreground focus-visible:ring-2"
          aria-label="User menu"
        >
          <Avatar className="size-8 border border-border/60 shadow-xs">
            <AvatarImage src={user.picture ?? undefined} alt={user.name ?? ""} />
            <AvatarFallback className="bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] text-foreground">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-medium">{user.name ?? "User"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-0 shadow-[0_22px_50px_-30px_var(--primary)]"
      >
        <DropdownMenuLabel className="border-b border-border/50 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_90%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))] px-4 py-4">
          <div className="flex items-start gap-3">
            <Avatar className="size-11 border border-border/60 shadow-xs">
              <AvatarImage src={user.picture ?? undefined} alt={user.name ?? ""} />
              <AvatarFallback className="bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] text-foreground">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-semibold">{user.name ?? "User"}</span>
            {user.email && (
              <span className="text-muted-foreground truncate pt-0.5 text-xs font-normal">
                {user.email}
              </span>
            )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuGroup className="p-2">
          <DropdownMenuItem asChild className="rounded-xl px-3 py-3 focus:bg-secondary/10 focus:text-foreground">
            <Link href="/dashboard" className="flex items-center gap-3">
              <LayoutDashboard className="size-4" />
              Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-xl px-3 py-3 focus:bg-secondary/10 focus:text-foreground">
            <Link href="/dashboard/profile" className="flex items-center gap-3">
              <User className="size-4" />
              Profile
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="mx-2" />
        <div className="p-2">
          <DropdownMenuItem asChild className="rounded-xl px-3 py-3 text-destructive focus:bg-destructive/10 focus:text-destructive">
            <a href="/auth/logout" className="flex items-center gap-3" onClick={handleLogout}>
            <LogOut className="size-4" />
            Log out
            </a>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
