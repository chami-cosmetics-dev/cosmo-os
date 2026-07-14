"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, X } from "lucide-react";
import Link from "next/link";

import { TaskReminderBubbleIcon } from "@/components/molecules/task-reminder-bubble-icon";
import { Button } from "@/components/ui/button";
import { useIdleScreenBounce } from "@/hooks/use-idle-screen-bounce";
import { useVerticalDragPosition } from "@/hooks/use-vertical-drag-position";
import { cn } from "@/lib/utils";
import { TASK_REMINDER_SLA_HOURS } from "@/lib/task-reminder-sla";
import type { TaskReminderCategory } from "@/lib/task-reminders";

type TaskReminder = {
  id: string;
  category: TaskReminderCategory;
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
  visibleCategories?: TaskReminderCategory[];
};

const CATEGORY_ORDER = [
  "erp_sync_warning",
  "finance_approval",
  "add_samples",
  "print",
  "ready_dispatch",
  "rearrange_dispatch",
  "delivery_pending",
  "invoice_complete",
  "return_action",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  erp_sync_warning: "ERP sync warnings",
  finance_approval: "Finance approvals",
  add_samples: "Samples / free issue",
  print: "Print",
  rearrange_dispatch: "Rearrange dispatch",
  ready_dispatch: "Ready to dispatch",
  return_action: "Returned orders",
  delivery_pending: "Delivery pending",
  invoice_complete: "Invoice complete",
};

const CATEGORY_NODE_LABELS: Record<string, string> = {
  erp_sync_warning: "Warning",
  finance_approval: "Finance approvals",
  add_samples: "Samples",
  print: "Print",
  rearrange_dispatch: "Rearrange",
  ready_dispatch: "Dispatch",
  return_action: "Returns",
  delivery_pending: "Delivery pending",
  invoice_complete: "Invoice complete",
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
  onDismissAll,
}: {
  title: string;
  items: TaskReminder[];
  onClose: () => void;
  onDismissAll?: () => void;
}) {
  return (
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
          <p className="text-sm font-semibold text-cyan-50">{title}</p>
          <p className="text-xs text-cyan-200/60">
            <span className="text-red-400">{items.length}</span> overdue · SLA {TASK_REMINDER_SLA_HOURS}h+
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
        {items.length === 0 ? (
          <li className="rounded-md border border-dashed border-cyan-500/25 bg-slate-950/30 px-4 py-8 text-center text-sm text-cyan-200/70">
            No overdue tasks in this queue ({TASK_REMINDER_SLA_HOURS}h+ SLA).
          </li>
        ) : (
          items.map((item) => (
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
          ))
        )}
      </ul>

      <div className="border-t border-cyan-500/25 px-3 py-2">
        {onDismissAll ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full font-mono text-amber-400 hover:bg-amber-500/10 hover:text-amber-200"
            onClick={onDismissAll}
          >
            <ChevronDown className="mr-1 size-4" />
            DISMISS ALL WARNINGS
          </Button>
        ) : (
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
        )}
      </div>
    </div>
  );
}

function CategoryNode({
  label,
  count,
  active,
  onClick,
  variant = "default",
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  variant?: "default" | "warning";
}) {
  const hasOverdue = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pointer-events-auto relative flex min-w-[9.5rem] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
        "shadow-[0_4px_18px_rgba(0,0,0,0.35)]",
        variant === "warning"
          ? active
            ? "border-amber-300/80 bg-[linear-gradient(135deg,#d97706,#92400e)] text-white shadow-[0_0_20px_rgba(245,158,11,0.5)]"
            : hasOverdue
              ? "border-amber-500/60 bg-[linear-gradient(135deg,#b45309,#78350f)] text-amber-50 hover:scale-[1.02] hover:border-amber-300/80 hover:shadow-[0_0_16px_rgba(245,158,11,0.4)]"
              : "border-amber-500/20 bg-[linear-gradient(135deg,#451a03,#1c0a00)] text-amber-200/50 hover:scale-[1.02] hover:border-amber-400/30"
          : active
            ? hasOverdue
              ? "border-emerald-300/80 bg-[linear-gradient(135deg,#22c55e,#15803d)] text-white shadow-[0_0_20px_rgba(34,197,94,0.45)]"
              : "border-cyan-300/60 bg-[linear-gradient(135deg,#0e7490,#164e63)] text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.25)]"
            : hasOverdue
              ? "border-emerald-500/40 bg-[linear-gradient(135deg,#16a34a,#166534)] text-emerald-50 hover:scale-[1.02] hover:border-emerald-300/70 hover:shadow-[0_0_16px_rgba(34,197,94,0.35)]"
              : "border-cyan-500/30 bg-[linear-gradient(135deg,#0c4a6e,#082f49)] text-cyan-100/80 hover:scale-[1.02] hover:border-cyan-400/50",
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
        data-reminder-connector
        className={cn(
          "absolute top-1/2 -right-1 size-2 -translate-y-1/2 rounded-sm border border-white/30",
          active ? "bg-emerald-200" : "bg-emerald-400/80",
        )}
        aria-hidden
      />
    </button>
  );
}

function NodeConnectors({
  containerRef,
  anchorRef,
  nodeCount,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  anchorRef: React.RefObject<HTMLElement | null>;
  nodeCount: number;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updatePaths = useCallback(() => {
    const container = containerRef.current;
    const anchor = anchorRef.current;
    if (!container || !anchor || nodeCount === 0) {
      setPaths([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const endX = anchorRect.left - containerRect.left;
    const endY = anchorRect.top + anchorRect.height / 2 - containerRect.top;

    const connectors = container.querySelectorAll<HTMLElement>("[data-reminder-connector]");
    const nextPaths = Array.from(connectors).map((connector) => {
      const connectorRect = connector.getBoundingClientRect();
      const startX = connectorRect.left + connectorRect.width / 2 - containerRect.left;
      const startY = connectorRect.top + connectorRect.height / 2 - containerRect.top;
      const controlX = startX + (endX - startX) * 0.55;
      return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
    });

    setSize({ width: containerRect.width, height: containerRect.height });
    setPaths(nextPaths);
  }, [anchorRef, containerRef, nodeCount]);

  useEffect(() => {
    updatePaths();
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new ResizeObserver(() => updatePaths());
    observer.observe(container);
    window.addEventListener("resize", updatePaths);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePaths);
    };
  }, [containerRef, updatePaths]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={size.width}
      height={size.height}
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

function useComposeRefs<T>(refA: React.Ref<T>, refB: React.Ref<T>) {
  return useCallback(
    (node: T | null) => {
      for (const ref of [refA, refB]) {
        if (typeof ref === "function") ref(node);
        else {
          (ref as React.MutableRefObject<T | null>).current = node;
        }
      }
    },
    [refA, refB],
  );
}

export function TaskReminderBubbles() {
  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<TaskReminderCategory[]>([]);
  const [nodesOpen, setNodesOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<TaskReminderCategory | null>(null);
  const [showAllPanel, setShowAllPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const hudVisible = !loading && authenticated;
  const hasOverdue = reminders.length > 0;
  const panelsOpen = nodesOpen || showAllPanel || activeCategory !== null;
  const {
    containerRef: dragContainerRef,
    bottomPx,
    isDragging,
    onDragHandlePointerDown,
    onDragHandlePointerMove,
    onDragHandlePointerUp,
    onDragHandlePointerCancel,
  } = useVerticalDragPosition(hudVisible);
  const { containerRef: bounceContainerRef, isBouncing, position } = useIdleScreenBounce({
    enabled: hudVisible && hasOverdue && !panelsOpen && !isDragging,
    idleMs: 60_000,
  });
  const containerRef = useComposeRefs(dragContainerRef, bounceContainerRef);

  const loadReminders = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/task-reminders", { cache: "no-store" });
      if (!response.ok) {
        setAuthenticated(false);
        setReminders([]);
        setVisibleCategories([]);
        return;
      }
      setAuthenticated(true);
      const data = (await response.json()) as TaskRemindersResponse;
      setReminders(data.reminders ?? []);
      setVisibleCategories(data.visibleCategories ?? []);
    } catch {
      setAuthenticated(false);
      setReminders([]);
      setVisibleCategories([]);
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
  const userCategories = useMemo(
    () => CATEGORY_ORDER.filter((category) => visibleCategories.includes(category)),
    [visibleCategories],
  );

  useEffect(() => {
    if (activeCategory && !userCategories.includes(activeCategory)) {
      setActiveCategory(null);
    }
  }, [activeCategory, userCategories]);

  const closePanels = useCallback(() => {
    setActiveCategory(null);
    setShowAllPanel(false);
    setNodesOpen(false);
  }, []);

  const toggleCategory = useCallback((category: TaskReminderCategory) => {
    setShowAllPanel(false);
    setActiveCategory((current) => (current === category ? null : category));
  }, []);

  const hudRowRef = useRef<HTMLDivElement>(null);
  const bubbleAnchorRef = useRef<HTMLSpanElement>(null);

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
        !isBouncing && "right-6",
        isBouncing && "reminder-idle-bounce-active",
      )}
      style={isBouncing && position ? { left: position.x, top: position.y } : { bottom: bottomPx }}
    >
      <div ref={hudRowRef} className="pointer-events-auto relative flex items-end">
        {showAllPanel && (
          <div className="mr-3">
            <ReminderListPanel title="All overdue tasks" items={reminders} onClose={() => setShowAllPanel(false)} />
          </div>
        )}

        {activeCategory && !showAllPanel && (
          <div className="mr-3">
            <ReminderListPanel
              title={panelTitle}
              items={activeItems}
              onClose={() => setActiveCategory(null)}
              onDismissAll={
                activeCategory === "erp_sync_warning"
                  ? async () => {
                      await fetch("/api/admin/notifications", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "erp_sync_failure" }),
                      }).catch(() => null);
                      setActiveCategory(null);
                      await loadReminders();
                    }
                  : undefined
              }
            />
          </div>
        )}

        {nodesOpen && userCategories.length > 0 && (
          <>
            <NodeConnectors
              containerRef={hudRowRef}
              anchorRef={bubbleAnchorRef}
              nodeCount={userCategories.length}
            />
            <div className="relative mr-14 flex flex-col gap-2 py-1">
              {userCategories.map((category) => (
                <CategoryNode
                  key={category}
                  label={CATEGORY_NODE_LABELS[category] ?? CATEGORY_LABELS[category] ?? category}
                  count={grouped.get(category)?.length ?? 0}
                  active={activeCategory === category}
                  onClick={() => toggleCategory(category)}
                  variant={category === "erp_sync_warning" ? "warning" : "default"}
                />
              ))}
            </div>
          </>
        )}

        {nodesOpen && userCategories.length === 0 && (
          <div className="pointer-events-auto mr-14 max-w-[14rem] rounded-lg border border-cyan-500/30 bg-slate-950/90 px-3 py-3 text-xs text-cyan-200/75">
            No reminder queues are assigned to your role. Ask an admin to add fulfillment or finance
            permissions.
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
              "group relative touch-none rounded-full pb-7 transition-transform duration-300 select-none",
              !isDragging && !isBouncing && "hover:scale-110 active:scale-95",
              isDragging && "scale-105 cursor-grabbing",
              !isDragging && !isBouncing && "cursor-grab",
              isBouncing && "reminder-idle-bounce-target",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2",
            )}
            title={
              isBouncing
                ? "Move mouse to stop bouncing · Drag up or down to move · Click to open"
                : "Drag up or down to move · Click to open"
            }
            onPointerDown={onDragHandlePointerDown}
            onPointerMove={onDragHandlePointerMove}
            onPointerUp={(event) => {
              const result = onDragHandlePointerUp(event);
              if (result?.dragged) return;
              setNodesOpen((open) => {
                if (open) {
                  setActiveCategory(null);
                  setShowAllPanel(false);
                }
                return !open;
              });
            }}
            onPointerCancel={onDragHandlePointerCancel}
            aria-expanded={nodesOpen}
            aria-label={`${reminders.length} overdue tasks. Drag vertically to move. ${nodesOpen ? "Hide categories" : "Show categories"}`}
          >
            <span
              className={cn(
                "absolute inset-[-12px] -z-10 rounded-full blur-xl",
                hasOverdue
                  ? "bg-[radial-gradient(circle,rgba(239,68,68,0.25),rgba(34,211,238,0.3)_45%,transparent_72%)]"
                  : "bg-[radial-gradient(circle,rgba(34,211,238,0.15),rgba(15,23,42,0.2)_45%,transparent_72%)]",
              )}
            />
            <span ref={bubbleAnchorRef} className="inline-flex">
              <TaskReminderBubbleIcon count={reminders.length} active={nodesOpen} />
            </span>
            {!nodesOpen && (
              <span
                className={cn(
                  "absolute -bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider shadow-[0_0_14px_rgba(34,211,238,0.2)]",
                  hasOverdue
                    ? "border-red-500/50 bg-slate-950/95 text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.35)]"
                    : "border-cyan-500/40 bg-slate-950/95 text-cyan-300",
                )}
              >
                {hasOverdue ? `${reminders.length} OVERDUE` : "ALL CLEAR"}
              </span>
            )}
          </button>

          {nodesOpen && (
            <button
              type="button"
              onClick={closePanels}
              className={cn(
                "mt-2 whitespace-nowrap rounded border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider",
                hasOverdue
                  ? "border-red-500/45 bg-slate-950/95 text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.35)]"
                  : "border-cyan-500/40 bg-slate-950/95 text-cyan-300",
              )}
            >
              {hasOverdue ? `${reminders.length} OVERDUE` : "ALL CLEAR"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
