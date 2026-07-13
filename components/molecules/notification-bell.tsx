"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatAppDate } from "@/lib/format-datetime";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

function notificationHref(item: NotificationItem) {
  if (item.entityType === "ApprovalRequest") return "/dashboard/approvals";
  return "/dashboard";
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "Now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return formatAppDate(date, "");
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadNotifications() {
    const response = await fetch("/api/admin/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      unreadCount?: number;
      notifications?: NotificationItem[];
    };
    setUnreadCount(data.unreadCount ?? 0);
    setItems(data.notifications ?? []);
  }

  async function markRead(id?: string) {
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    }).catch(() => null);
    await loadNotifications();
  }

  function visibleNotifications() {
    return items.filter((item) => item.readAt === null);
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotifications(), 0);
    const interval = window.setInterval(() => void loadNotifications(), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <DropdownMenu onOpenChange={(open) => open && loadNotifications()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10 rounded-xl">
          <Bell className="size-4" aria-hidden />
          <span className="sr-only">Notifications</span>
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              className="px-2 text-xs font-medium text-primary hover:underline"
              onClick={() => void markRead()}
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {visibleNotifications().length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            No notifications.
          </div>
        ) : (
          visibleNotifications().map((item) => (
            <DropdownMenuItem key={item.id} asChild className="cursor-pointer">
              <Link
                href={notificationHref(item)}
                onClick={() => void markRead(item.id)}
                className="flex flex-col items-start gap-1 whitespace-normal"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-medium">{item.title}</span>
                  {!item.readAt && <span className="size-2 rounded-full bg-primary" aria-hidden />}
                </span>
                {item.body && <span className="text-xs text-muted-foreground">{item.body}</span>}
                <span className="text-[11px] text-muted-foreground">{formatRelative(item.createdAt)}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
