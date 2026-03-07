"use client";

import Link from "next/link";
import { LayoutDashboard, LogOut, User } from "lucide-react";

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2 py-1 pr-3 text-foreground shadow-sm outline-none ring-sidebar-ring transition-colors hover:bg-accent/70 focus-visible:ring-2"
          aria-label="User menu"
        >
          <Avatar className="size-9 border border-border/70">
            <AvatarImage src={user.picture ?? undefined} alt={user.name ?? ""} />
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="max-w-36 truncate text-sm font-semibold">{user.name ?? "User"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 rounded-xl border-border/70 bg-popover/95 p-0 shadow-xl backdrop-blur-sm"
      >
        <DropdownMenuLabel className="px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Signed in as
            </span>
            <span className="truncate text-base font-semibold">{user.name ?? "User"}</span>
            {user.email && (
              <span className="truncate text-sm font-normal text-muted-foreground">
                {user.email}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuGroup className="p-1.5">
          <DropdownMenuItem asChild className="rounded-lg px-3 py-2 text-base">
            <Link href="/dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="size-4" />
              Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-lg px-3 py-2 text-base">
            <Link href="/dashboard/profile" className="flex items-center gap-2">
              <User className="size-4" />
              Profile
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem asChild variant="destructive" className="m-1.5 rounded-lg px-3 py-2 text-base">
          <a href="/auth/logout" className="flex items-center gap-2">
            <LogOut className="size-4" />
            Log out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
