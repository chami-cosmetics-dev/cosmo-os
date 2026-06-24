"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, X } from "lucide-react";
import Link from "next/link";

import { TaskReminderBubbleIcon } from "@/components/molecules/task-reminder-bubble-icon";
import { Button } from "@/components/ui/button";
import { useTaskReminderSafeArea } from "@/components/providers/task-reminder-safe-area-provider";
import { useIdleScreenBounce } from "@/hooks/use-idle-screen-bounce";
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

const CATEGORY_ORDER = [
  "finance_approval",
  "add_samples",
  "print",
  "ready_dispatch",
  "rearrange_dispatch",
  "delivery_pending",
  "return_action",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  finance_approval: "Finance approvals",
  add_samples: "Samples / free issue",
  print: "Print",
  rearrange_dispatch: "Rearrange dispatch",
  ready_dispatch: "Ready to dispatch",
  return_action: "Returned orders",
  delivery_pending: "Delivery pending",
};

const CATEGORY_NODE_LABELS: Record<string, string> = {
  finance_approval: "Finance approvals",
  add_samples: "Samples",
  print: "Print",
  rearrange_dispatch: "Rearrange",
  ready_dispatch: "Dispatch",
  return_action: "Returns",
  delivery_pending: "Delivery pending",
};

function groupReminders(reminders: TaskReminder[]) {
  const groups = new Map<string, TaskReminder[]>();
  for (const reminder of reminders) {
    const list = groups.get(reminder.category) ?? [];
    list.push(reminder);
    groups.set(reminder.category, list);
  }
  return groups;
}

function ReminderListPanel({
  title,
  items,
  onClose,
}: {
  title: string;
  items: TaskReminder[];
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto mb-3 w-[min(100vw-2.5rem,22rem)] overflow-hidden rounded-lg border border-cyan-400/30",
        "bg-[linear-gradient(165deg,rgba(2,8,23,0.96),rgba(8,47,73,0.92))]",
        "shadow-[0_0_32px_rgba(34,211,238,0.2),0_22px_50px_-28px_rgba(0,0,0,0.65)]",
        "backdrop-blur-xl",
        "animate-in fade-in-0 slide-in-from-bottom-4 duration-300",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-cyan-500/25 px-4 py-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-400/80 uppercase">System alert</p>
          <p className="text-sm font-semibold text-cyan-50">{title}</p>
          <p className="text-xs text-cyan-200/60">
            <span className="text-red-400">{items.length}</span> overdue · SLA 24h+
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-cyan-500/30 p-1.5 text-cyan-300/80 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-100"
          onClick={onClose}
          aria-label="Close reminders"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="max-h-[min(24rem,55vh)] space-y-2 overflow-y-auto px-3 py-3">
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
              <span className="mt-1 block text-xs leading-relaxed text-cyan-100/65">{item.body}</span>
              <span className="mt-2 inline-flex rounded border border-red-500/50 bg-red-950/50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-300">
                {item.waitingHours}h · OPEN_QUEUE
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="border-t border-cyan-500/25 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full font-mono text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-100"
          onClick={onClose}
        >
          <ChevronDown className="mr-1 size-4" />
          MINIMIZE_HUD
        </Button>
      </div>
    </div>
  );
}

function CategoryNode({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pointer-events-auto relative flex min-w-[9.5rem] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
        "shadow-[0_4px_18px_rgba(0,0,0,0.35)]",
        active
          ? "border-emerald-300/80 bg-[linear-gradient(135deg,#22c55e,#15803d)] text-white shadow-[0_0_20px_rgba(34,197,94,0.45)]"
          : "border-emerald-500/40 bg-[linear-gradient(135deg,#16a34a,#166534)] text-emerald-50 hover:scale-[1.02] hover:border-emerald-300/70 hover:shadow-[0_0_16px_rgba(34,197,94,0.35)]",
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span
        className={cn(
          "flex min-w-[1.5rem] items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-bold",
          active ? "bg-white/20 text-white" : "bg-black/20 text-emerald-100",
        )}
      >
        {count}
      </span>
      <span
        className={cn(
          "absolute top-1/2 -right-1 size-2 -translate-y-1/2 rounded-sm border border-white/30",
          active ? "bg-emerald-200" : "bg-emerald-400/80",
        )}
        aria-hidden
      />
    </button>
  );
}

function NodeConnectors({ nodeCount }: { nodeCount: number }) {
  if (nodeCount === 0) return null;

  const height = nodeCount * 52 + Math.max(0, nodeCount - 1) * 8;
  const paths = Array.from({ length: nodeCount }, (_, index) => {
    const y = 26 + index * 60;
    return `M 0 ${y} C 28 ${y}, 36 ${height / 2}, 56 ${height / 2}`;
  });

  return (
    <svg
      className="pointer-events-none absolute top-0 -right-14 h-full w-14 overflow-visible"
      style={{ height }}
      aria-hidden
    >
      {paths.map((path, index) => (
        <path
          key={index}
          d={path}
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export function TaskReminderBubbles() {
  const { setReminderHudVisible } = useTaskReminderSafeArea();
  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [nodesOpen, setNodesOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showAllPanel, setShowAllPanel] = useState(false);
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

  const grouped = useMemo(() => groupReminders(reminders), [reminders]);
  const visibleCategories = useMemo(
    () => CATEGORY_ORDER.filter((category) => (grouped.get(category)?.length ?? 0) > 0),
    [grouped],
  );

  useEffect(() => {
    if (activeCategory && !grouped.has(activeCategory)) {
      setActiveCategory(null);
    }
  }, [activeCategory, grouped]);

  const closePanels = useCallback(() => {
    setActiveCategory(null);
    setShowAllPanel(false);
    setNodesOpen(false);
  }, []);

  const panelsOpen = nodesOpen || showAllPanel || activeCategory !== null;
  const { containerRef, isBouncing, position } = useIdleScreenBounce({
    enabled: !panelsOpen && reminders.length > 0 && !loading,
    idleMs: 60_000,
  });

  const toggleCategory = useCallback((category: string) => {
    setShowAllPanel(false);
    setActiveCategory((current) => (current === category ? null : category));
  }, []);

  const hudVisible = !loading && reminders.length > 0;

  useEffect(() => {
    setReminderHudVisible(hudVisible);
    return () => setReminderHudVisible(false);
  }, [hudVisible, setReminderHudVisible]);

  if (!hudVisible) {
    return null;
  }

  const activeItems = activeCategory ? (grouped.get(activeCategory) ?? []) : [];
  const panelTitle = activeCategory
    ? (CATEGORY_LABELS[activeCategory] ?? activeCategory)
    : "All overdue tasks";

  return (
    <div
      ref={containerRef}
      className={cn(
        "pointer-events-none fixed z-40 flex flex-col items-end gap-0",
        !isBouncing && "bottom-6 right-6",
        isBouncing && "reminder-idle-bounce-active",
      )}
      style={
        isBouncing && position
          ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
          : undefined
      }
    >
      {showAllPanel && (
        <ReminderListPanel title="All overdue tasks" items={reminders} onClose={() => setShowAllPanel(false)} />
      )}

      {activeCategory && activeItems.length > 0 && !showAllPanel && (
        <ReminderListPanel title={panelTitle} items={activeItems} onClose={() => setActiveCategory(null)} />
      )}

      <div className="pointer-events-auto flex items-center">
        {nodesOpen && visibleCategories.length > 0 && (
          <div className="relative mr-14 flex flex-col gap-2 py-1">
            <NodeConnectors nodeCount={visibleCategories.length} />
            {visibleCategories.map((category) => (
              <CategoryNode
                key={category}
                label={CATEGORY_NODE_LABELS[category] ?? CATEGORY_LABELS[category] ?? category}
                count={grouped.get(category)?.length ?? 0}
                active={activeCategory === category}
                onClick={() => toggleCategory(category)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col items-center">
          {nodesOpen && (
            <button
              type="button"
              onClick={() => {
                setActiveCategory(null);
                setShowAllPanel(true);
              }}
              className={cn(
                "mb-2 flex items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-slate-950/90 px-3 py-1.5",
                "font-mono text-[11px] tracking-wide text-cyan-200/90 shadow-[0_0_12px_rgba(34,211,238,0.2)]",
                "transition-colors hover:border-cyan-400/60 hover:bg-cyan-950/80 hover:text-cyan-50",
              )}
            >
              <Eye className="size-3.5" />
              View all
            </button>
          )}

          <button
            type="button"
            className={cn(
              "group relative rounded-full pb-7 transition-transform duration-300",
              "hover:scale-110 active:scale-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2",
              "reminder-idle-bounce-target",
            )}
            onClick={() => {
              setNodesOpen((open) => {
                if (open) {
                  setActiveCategory(null);
                  setShowAllPanel(false);
                }
                return !open;
              });
            }}
            aria-expanded={nodesOpen}
            aria-label={`${reminders.length} overdue tasks. ${nodesOpen ? "Hide categories" : "Show categories"}`}
          >
            <span className="absolute inset-[-12px] -z-10 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.25),rgba(34,211,238,0.3)_45%,transparent_72%)] blur-xl" />
            <TaskReminderBubbleIcon count={reminders.length} active={nodesOpen} />
            {!nodesOpen && (
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-red-500/50 bg-slate-950/95 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.35)]">
                {reminders.length} OVERDUE
              </span>
            )}
          </button>

          {nodesOpen && (
            <button
              type="button"
              onClick={closePanels}
              className="mt-2 whitespace-nowrap rounded border border-red-500/45 bg-slate-950/95 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.35)]"
            >
              {reminders.length} OVERDUE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
