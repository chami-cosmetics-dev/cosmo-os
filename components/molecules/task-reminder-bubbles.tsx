"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import Link from "next/link";

import { TaskReminderBubbleIcon } from "@/components/molecules/task-reminder-bubble-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TaskReminder = {
  id: string;
  category: string;
  title: string;
  body: string;
  href: string;
  waitingHours: number;
  orderId?: string;
  invoiceLabel: string;
};

type TaskRemindersResponse = {
  reminders?: TaskReminder[];
  totalCount?: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  finance_approval: "Finance approvals",
  add_samples: "Samples / free issue",
  print: "Print queue",
  rearrange_dispatch: "Rearrange dispatch",
  ready_dispatch: "Ready to dispatch",
  return_action: "Returned orders",
  delivery_pending: "Delivery pending",
};

function groupReminders(reminders: TaskReminder[]) {
  const groups = new Map<string, TaskReminder[]>();
  for (const reminder of reminders) {
    const list = groups.get(reminder.category) ?? [];
    list.push(reminder);
    groups.set(reminder.category, list);
  }
  return Array.from(groups.entries());
}

export function TaskReminderBubbles() {
  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadReminders = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/task-reminders", { cache: "no-store" });
      if (!response.ok) {
        setReminders([]);
        return;
      }
      const data = (await response.json()) as TaskRemindersResponse;
      setReminders(data.reminders ?? []);
    } catch {
      setReminders([]);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void loadReminders().finally(() => setLoading(false));
    }, 3000);
    const interval = window.setInterval(() => void loadReminders(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadReminders]);

  if (loading || reminders.length === 0) {
    return null;
  }

  const grouped = groupReminders(reminders);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {expanded && (
        <div
          className={cn(
            "pointer-events-auto w-[min(100vw-2.5rem,22rem)] overflow-hidden rounded-lg border border-cyan-400/30",
            "bg-[linear-gradient(165deg,rgba(2,8,23,0.96),rgba(8,47,73,0.92))]",
            "shadow-[0_0_32px_rgba(34,211,238,0.2),0_22px_50px_-28px_rgba(0,0,0,0.65)]",
            "backdrop-blur-xl",
            "animate-in fade-in-0 slide-in-from-bottom-4 duration-300",
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b border-cyan-500/25 px-4 py-3">
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-400/80 uppercase">System alert</p>
              <p className="text-sm font-semibold text-cyan-50">
                <span className="text-red-400">{reminders.length}</span> overdue task
                {reminders.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-cyan-200/60">SLA breach · 24h+ waiting</p>
            </div>
            <button
              type="button"
              className="rounded border border-cyan-500/30 p-1.5 text-cyan-300/80 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-100"
              onClick={() => setExpanded(false)}
              aria-label="Close reminders"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[min(24rem,55vh)] space-y-3 overflow-y-auto px-3 py-3">
            {grouped.map(([category, items]) => (
              <div key={category} className="space-y-2">
                <p className="px-1 font-mono text-[10px] tracking-[0.18em] text-cyan-400/70 uppercase">
                  {CATEGORY_LABELS[category] ?? category}
                </p>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className={cn(
                          "block rounded-md border border-cyan-500/20 bg-slate-950/50 px-3 py-2.5 transition-all",
                          "hover:-translate-y-0.5 hover:border-cyan-400/45 hover:bg-cyan-950/40 hover:shadow-[0_0_16px_rgba(34,211,238,0.15)]",
                        )}
                      >
                        <span className="block text-sm font-medium text-cyan-50">{item.title}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-cyan-100/65">
                          {item.body}
                        </span>
                        <span className="mt-2 inline-flex rounded border border-red-500/50 bg-red-950/50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-300">
                          {item.waitingHours}h · OPEN_QUEUE
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-cyan-500/25 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full font-mono text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-100"
              onClick={() => setExpanded(false)}
            >
              <ChevronDown className="mr-1 size-4" />
              MINIMIZE_HUD
            </Button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={cn(
          "pointer-events-auto group relative rounded-full pb-7 transition-transform duration-300",
          "hover:scale-110 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2",
        )}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`${reminders.length} overdue tasks. ${expanded ? "Collapse" : "Expand"} reminder panel`}
      >
        <span className="absolute inset-[-12px] -z-10 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.25),rgba(34,211,238,0.3)_45%,transparent_72%)] blur-xl" />
        <TaskReminderBubbleIcon count={reminders.length} active={expanded} />
        {!expanded && (
          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-red-500/50 bg-slate-950/95 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.35)]">
            {reminders.length} OVERDUE
          </span>
        )}
      </button>
    </div>
  );
}
