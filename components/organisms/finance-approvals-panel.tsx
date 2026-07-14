"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Search, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";
import { TASK_REMINDER_ORDER_ID_PARAM } from "@/lib/task-reminder-links";

export type FinanceApprovalItem = {
  id: string;
  type: string;
  status: string;
  orderId?: string | null;
  orderMissing?: boolean;
  paymentTypeLabel?: string | null;
  invoiceNo: string | null;
  totalPrice: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  requestNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewedByEmail: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId?: string | null;
  erpAdminInvoiceUrl?: string | null;
  returnedByName?: string | null;
  returnedByEmail?: string | null;
  cancelRequestedByName?: string | null;
  cancelRequestedByEmail?: string | null;
  returnRemark?: string | null;
  cancelRemark?: string | null;
  returnDate?: string | null;
  cancelRequestedAt?: string | null;
  riderId?: string | null;
  riderName?: string | null;
  riderMobile?: string | null;
};

/** Filter tabs: All + each finance approval type (more detailed than Payments/Returns groups). */
type TypeFilter =
  | "all"
  | "order_payment_approval"
  | "delivery_payment_approval"
  | "payment_method_change_approval"
  | "return_rearrange_payment"
  | "return_cancel"
  | "invoice_revert_void_approval"
  | "order_cancel_approval";

const TYPE_FILTER_TABS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "order_payment_approval", label: "Order Payment" },
  { key: "delivery_payment_approval", label: "Delivery Payment" },
  { key: "payment_method_change_approval", label: "Method Change" },
  { key: "return_rearrange_payment", label: "Return Rearrange" },
  { key: "return_cancel", label: "Return Cancel" },
  { key: "invoice_revert_void_approval", label: "Invoice Revert" },
  { key: "order_cancel_approval", label: "Order Cancel" },
];

function typeLabel(type: string) {
  if (type === "order_payment_approval") return "Order Payment";
  if (type === "return_rearrange_payment") return "Return Rearrange";
  if (type === "return_cancel") return "Return Cancel";
  if (type === "delivery_payment_approval") return "Delivery Payment";
  if (type === "invoice_revert_void_approval") return "Invoice Revert Void";
  if (type === "payment_method_change_approval") return "Payment Method Change";
  if (type === "order_cancel_approval") return "Order Cancel";
  return type;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  order_payment_approval: {
    label: "Pre-Dispatch Approval",
    cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40",
  },
  delivery_payment_approval: {
    label: "Delivery Collection",
    cls: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/40",
  },
  payment_method_change_approval: {
    label: "Method Change",
    cls: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700/40",
  },
  return_rearrange_payment: {
    label: "Return Rearrange",
    cls: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/40",
  },
  return_cancel: {
    label: "Return Cancel",
    cls: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/40",
  },
  invoice_revert_void_approval: {
    label: "Invoice Revert",
    cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600/40",
  },
  order_cancel_approval: {
    label: "Order Cancel",
    cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40",
  },
};

function TypeBadge({ type }: { type: string }) {
  const badge = TYPE_BADGE[type];
  if (!badge) return <span className="text-xs text-muted-foreground">{type}</span>;
  return (
    <span className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function paymentLabel(approval: Pick<FinanceApprovalItem, "type" | "paymentTypeLabel" | "requestNote">) {
  if (approval.type === "delivery_payment_approval") {
    // Extract just the payment method from the note (e.g. "cod", "bank_transfer")
    const raw = approval.paymentTypeLabel ?? approval.requestNote ?? "";
    const method = raw.split(/\s*[—–-]\s*/)[0].trim();
    return method ? method.toUpperCase() : "COD";
  }
  return approval.paymentTypeLabel ?? typeLabel(approval.type);
}

function formatDate(value: string | null) {
  return formatAppDateTime(value, "-");
}

function formatAmount(value: string | null) {
  if (!value) return "-";
  const amount = Number.parseFloat(value);
  return Number.isNaN(amount) ? value : amount.toLocaleString("en-LK", { minimumFractionDigits: 2 });
}


function isPendingApproval(approval: FinanceApprovalItem) {
  return approval.status === "pending";
}

function riderLabel(approval: Pick<FinanceApprovalItem, "riderName" | "riderMobile" | "riderId">) {
  return approval.riderName?.trim() || approval.riderMobile?.trim() || (approval.riderId ? "Rider" : "No rider / non-rider");
}

function groupDeliveryApprovalsByRider(approvals: FinanceApprovalItem[]) {
  const groups = new Map<string, { key: string; label: string; items: FinanceApprovalItem[] }>();
  for (const approval of approvals) {
    const key = approval.riderId ?? "__none__";
    const label = riderLabel(approval);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(approval);
    } else {
      groups.set(key, { key, label, items: [approval] });
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return a.label.localeCompare(b.label);
  });
}

function matchesApprovalSearch(approval: FinanceApprovalItem, term: string) {
  const q = term.toLowerCase();
  const haystack = [
    approval.invoiceNo,
    approval.customerPhone,
    approval.customerEmail,
    approval.shopifyOrderId,
    approval.erpnextInvoiceId,
    approval.paymentTypeLabel,
    typeLabel(approval.type),
    approval.status,
    approval.requestNote,
    approval.reviewNote,
    approval.returnedByName,
    approval.returnedByEmail,
    approval.cancelRequestedByName,
    approval.cancelRequestedByEmail,
    approval.returnRemark,
    approval.cancelRemark,
    approval.riderName,
    approval.riderMobile,
  ];
  return haystack.some((value) => value?.toLowerCase().includes(q));
}

function filterByType(approvals: FinanceApprovalItem[], typeFilter: TypeFilter) {
  if (typeFilter === "all") return approvals;
  return approvals.filter((a) => a.type === typeFilter);
}

function selectFirstInView(
  approvals: FinanceApprovalItem[],
  view: "pending" | "history",
  typeFilter: TypeFilter,
  currentId: string
) {
  const byView = view === "pending" ? approvals.filter(isPendingApproval) : approvals.filter((item) => !isPendingApproval(item));
  const visible = filterByType(byView, typeFilter);
  if (visible.some((item) => item.id === currentId)) return currentId;
  return visible[0]?.id ?? "";
}

export function FinanceApprovalsPanel({
  initialApprovals,
  canRevertPaid = false,
}: {
  initialApprovals: FinanceApprovalItem[];
  canRevertPaid?: boolean;
}) {
  const searchParams = useSearchParams();
  const appliedDeepLinkRef = useRef<string | null>(null);
  const [approvals, setApprovals] = useState(initialApprovals);
  const [view, setView] = useState<"pending" | "history">("pending");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState(() =>
    selectFirstInView(initialApprovals, "pending", "all", "")
  );
  const [reviewNote, setReviewNote] = useState("");
  const [hodPassword, setHodPassword] = useState("");
  const [revertReason, setRevertReason] = useState("");
  const [busy, setBusy] = useState<"refresh" | "approve" | "reject" | "revert" | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const orderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim();
    if (!orderId || appliedDeepLinkRef.current === orderId) return;
    const match = approvals.find(
      (approval) => approval.orderId === orderId && isPendingApproval(approval),
    );
    if (!match) return;
    setView("pending");
    setSelectedId(match.id);
    appliedDeepLinkRef.current = orderId;
  }, [approvals, searchParams]);

  const effectiveSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);

  const pendingApprovals = approvals.filter(isPendingApproval);
  const historyApprovals = approvals.filter((item) => !isPendingApproval(item));
  const byView = view === "pending" ? pendingApprovals : historyApprovals;
  const visibleApprovals = filterByType(byView, typeFilter);
  const searchedApprovals = useMemo(() => {
    if (!effectiveSearch) return visibleApprovals;
    return visibleApprovals.filter((approval) => matchesApprovalSearch(approval, effectiveSearch));
  }, [visibleApprovals, effectiveSearch]);
  const selected = searchedApprovals.find((item) => item.id === selectedId) ?? null;
  const groupByRider = typeFilter === "delivery_payment_approval";
  const deliveryRiderGroups = useMemo(
    () => (groupByRider ? groupDeliveryApprovalsByRider(searchedApprovals) : []),
    [groupByRider, searchedApprovals],
  );

  const pendingCountByType = useMemo(() => {
    const counts: Record<TypeFilter, number> = {
      all: pendingApprovals.length,
      order_payment_approval: 0,
      delivery_payment_approval: 0,
      payment_method_change_approval: 0,
      return_rearrange_payment: 0,
      return_cancel: 0,
      invoice_revert_void_approval: 0,
      order_cancel_approval: 0,
    };
    for (const a of pendingApprovals) {
      if (a.type in counts) {
        counts[a.type as Exclude<TypeFilter, "all">] += 1;
      }
    }
    return counts;
  }, [pendingApprovals]);

  useEffect(() => {
    if (searchedApprovals.length === 0) {
      setSelectedId("");
      return;
    }
    if (!searchedApprovals.some((item) => item.id === selectedId)) {
      setSelectedId(searchedApprovals[0].id);
    }
  }, [searchedApprovals, selectedId]);

  function switchView(next: "pending" | "history") {
    setView(next);
    setSelectedId(selectFirstInView(approvals, next, typeFilter, selectedId));
    setReviewNote("");
  }

  function switchTypeFilter(next: TypeFilter) {
    setTypeFilter(next);
    setSelectedId(selectFirstInView(approvals, view, next, selectedId));
    setReviewNote("");
  }

  async function refresh() {
    setBusy("refresh");
    try {
      const response = await fetch("/api/admin/approvals", { cache: "no-store" });
      const data = (await response.json()) as { approvals?: FinanceApprovalItem[]; error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to load approvals");
        return;
      }
      setApprovals(data.approvals ?? []);
      setSelectedId((currentId) => selectFirstInView(data.approvals ?? [], view, typeFilter, currentId));
    } catch {
      notify.error("Failed to load approvals");
    } finally {
      setBusy(null);
    }
  }

  async function review(action: "approve" | "reject") {
    if (!selected) return;
    if (
      action === "approve" &&
      selected.type === "return_cancel" &&
      selected.erpAdminInvoiceUrl
    ) {
      window.open(selected.erpAdminInvoiceUrl, "_blank", "noopener,noreferrer");
    }
    setBusy(action);
    try {
      const response = await fetch(`/api/admin/approvals/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: reviewNote.trim() || null }),
      });
      const data = (await response.json()) as {
        error?: string;
        erpSyncFailed?: boolean;
        erpSyncError?: string;
      };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to review approval");
        return;
      }
      if (action === "approve" && data.erpSyncFailed) {
        notify.error(
          data.erpSyncError ??
            "Approval saved but ERP Sales Invoice could not be created. Check Failed ERP syncs."
        );
      } else if (action === "approve" && selected.type === "return_cancel") {
        notify.success(
          selected.erpAdminInvoiceUrl
            ? "ERP Sales Invoice opened. Complete cancellation in ERPNext, then this request is marked processed."
            : "Cancel request marked processed. Complete cancellation in ERPNext if not done already.",
        );
      } else {
        notify.success(action === "approve" ? "Approval granted." : "Approval rejected.");
      }
      setReviewNote("");
      await refresh();
    } catch {
      notify.error("Failed to review approval");
    } finally {
      setBusy(null);
    }
  }

  async function revertPaidToUnpaid() {
    if (!selected?.orderId || selected.orderMissing) return;
    if (!hodPassword.trim()) {
      notify.error("Enter the HOD password.");
      return;
    }
    setBusy("revert");
    try {
      const response = await fetch(`/api/admin/orders/${selected.orderId}/revert-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: hodPassword,
          reason: revertReason.trim() || null,
        }),
      });
      const data = (await response.json()) as { error?: string; approvalRequeued?: boolean };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to revert payment status");
        return;
      }
      notify.success(
        data.approvalRequeued
          ? "Order reverted to unpaid. A new finance approval was sent for payment confirmation."
          : "Order reverted to unpaid.",
      );
      setHodPassword("");
      setRevertReason("");
      await refresh();
    } catch {
      notify.error("Failed to revert payment status");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance Approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review payment, return, and order cancellation requests.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={busy !== null} className="gap-2">
          <RefreshCw className={`size-4 ${busy === "refresh" ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border/70 bg-background/70 p-1 shadow-xs">
          <Button
            type="button"
            size="sm"
            variant={view === "pending" ? "default" : "ghost"}
            onClick={() => switchView("pending")}
            className={view === "pending" ? "shadow-[0_10px_24px_-18px_var(--primary)]" : "hover:bg-secondary/10"}
          >
            Pending{pendingCountByType.all > 0 ? ` (${pendingCountByType.all})` : ""}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "history" ? "default" : "ghost"}
            onClick={() => switchView("history")}
            className={view === "history" ? "shadow-[0_10px_24px_-18px_var(--primary)]" : "hover:bg-secondary/10"}
          >
            History
          </Button>
        </div>

        <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
          {TYPE_FILTER_TABS.map((tab) => {
            const count = view === "pending" ? pendingCountByType[tab.key] : 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchTypeFilter(tab.key)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  typeFilter === tab.key
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {view === "pending" && count > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>{view === "pending" ? "Pending Requests" : "History"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-b border-border/50 px-4 py-3">
              <div className="relative max-w-md">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  placeholder={
                    groupByRider
                      ? "Search by invoice, customer, rider, ERP SI..."
                      : "Search by invoice, customer, ERP SI, or payment type..."
                  }
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="border-border/70 bg-background/90 pl-9"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/35 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-medium">Invoice</th>
                    <th className="px-3 py-3 font-medium">Purpose</th>
                    <th className="px-3 py-3 font-medium">Payment</th>
                    {groupByRider && <th className="px-3 py-3 font-medium">Rider</th>}
                    <th className="px-3 py-3 font-medium">Amount</th>
                    <th className="px-3 py-3 font-medium">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {groupByRider
                    ? deliveryRiderGroups.flatMap((group) => [
                        <tr key={`rider-${group.key}`} className="bg-muted/50">
                          <td
                            colSpan={6}
                            className="px-3 py-2 text-xs font-semibold tracking-wide text-foreground uppercase"
                          >
                            {group.label}
                            <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary normal-case">
                              {group.items.length}
                            </span>
                          </td>
                        </tr>,
                        ...group.items.map((approval) => (
                          <tr
                            key={approval.id}
                            className={`cursor-pointer border-b last:border-0 hover:bg-muted/35 ${selectedId === approval.id ? "bg-primary/8" : ""}`}
                            onClick={() => {
                              setSelectedId(approval.id);
                              setReviewNote("");
                            }}
                          >
                            <td className="px-3 py-3 font-medium">
                              {approval.invoiceNo ?? "-"}
                              {approval.orderMissing && (
                                <span className="ml-2 inline-flex rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                                  Order removed
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3"><TypeBadge type={approval.type} /></td>
                            <td className="px-3 py-3 text-muted-foreground">{paymentLabel(approval)}</td>
                            <td className="px-3 py-3 text-muted-foreground">{riderLabel(approval)}</td>
                            <td className="px-3 py-3">{formatAmount(approval.totalPrice)}</td>
                            <td className="px-3 py-3 text-muted-foreground">{formatDate(approval.createdAt)}</td>
                          </tr>
                        )),
                      ])
                    : searchedApprovals.map((approval) => (
                    <tr
                      key={approval.id}
                      className={`cursor-pointer border-b last:border-0 hover:bg-muted/35 ${selectedId === approval.id ? "bg-primary/8" : ""}`}
                      onClick={() => {
                        setSelectedId(approval.id);
                        setReviewNote("");
                      }}
                    >
                      <td className="px-3 py-3 font-medium">
                        {approval.invoiceNo ?? "-"}
                        {approval.orderMissing && (
                          <span className="ml-2 inline-flex rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                            Order removed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3"><TypeBadge type={approval.type} /></td>
                      <td className="px-3 py-3 text-muted-foreground">{paymentLabel(approval)}</td>
                      <td className="px-3 py-3">{formatAmount(approval.totalPrice)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDate(approval.createdAt)}</td>
                    </tr>
                  ))}
                  {searchedApprovals.length === 0 && (
                    <tr>
                      <td colSpan={groupByRider ? 6 : 5} className="px-3 py-10 text-center text-muted-foreground">
                        {effectiveSearch
                          ? "No approval requests match your search."
                          : view === "pending"
                            ? "No pending approval requests."
                            : "No approval history yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 self-start sticky top-4">
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <div className="space-y-2 rounded-md border border-border/70 p-3 text-sm">
                  <p><span className="font-medium">Type:</span> {typeLabel(selected.type)}</p>
                  <p><span className="font-medium">Invoice:</span> {selected.invoiceNo ?? "-"}</p>
                  {selected.orderMissing && (
                    <p className="text-rose-700 text-xs">
                      The linked order was removed from Vault OS. Reject this request to clear it — approval cannot create an ERP invoice.
                    </p>
                  )}
                  {selected.type !== "return_cancel" && (
                    <p><span className="font-medium">Amount:</span> {formatAmount(selected.totalPrice)}</p>
                  )}
                  <p><span className="font-medium">Customer:</span> {selected.customerPhone ?? selected.customerEmail ?? "-"}</p>
                  {selected.type === "delivery_payment_approval" && (
                    <p><span className="font-medium">Rider:</span> {riderLabel(selected)}</p>
                  )}
                  <p><span className="font-medium">Requested:</span> {formatDate(selected.createdAt)}</p>
                  {selected.type === "return_cancel" && (
                    <div className="space-y-3 border-t border-border/60 pt-3">
                      {!selected.erpAdminInvoiceUrl && (
                        <p className="text-amber-700 text-sm dark:text-amber-300">
                          ERP Sales Invoice link is unavailable. Open ERPNext manually using invoice{" "}
                          {selected.erpnextInvoiceId ?? selected.invoiceNo ?? "reference"}, then mark processed.
                        </p>
                      )}
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {selected.shopifyOrderId && (
                          <p><span className="font-medium text-foreground">Shopify ID:</span> {selected.shopifyOrderId}</p>
                        )}
                        {selected.erpnextInvoiceId && (
                          <p><span className="font-medium text-foreground">ERP SI:</span> {selected.erpnextInvoiceId}</p>
                        )}
                        <p><span className="font-medium text-foreground">Returned by:</span> {selected.returnedByName ?? selected.returnedByEmail ?? "-"}</p>
                        <p><span className="font-medium text-foreground">Cancel requested by:</span> {selected.cancelRequestedByName ?? selected.cancelRequestedByEmail ?? "-"}</p>
                        <p><span className="font-medium text-foreground">Return remark:</span> {selected.returnRemark ?? "-"}</p>
                        <p><span className="font-medium text-foreground">Cancel remark:</span> {selected.cancelRemark ?? "-"}</p>
                        <p><span className="font-medium text-foreground">Return date:</span> {selected.returnDate ? formatDate(selected.returnDate) : "-"}</p>
                        <p><span className="font-medium text-foreground">Cancel requested:</span> {selected.cancelRequestedAt ? formatDate(selected.cancelRequestedAt) : "-"}</p>
                      </div>
                    </div>
                  )}
                  {selected.type === "order_cancel_approval" && (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700/40 dark:bg-red-900/20 dark:text-red-200">
                        Order cancel approval — cancel the order in Shopify and create a credit note in ERPNext, then approve here to mark the order as voided.
                      </div>
                      {selected.cancelRemark && (
                        <p className="text-sm"><span className="font-medium">Cancel reason:</span> {selected.cancelRemark}</p>
                      )}
                      {selected.cancelRequestedAt && (
                        <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Requested at:</span> {formatDate(selected.cancelRequestedAt)}</p>
                      )}
                    </div>
                  )}
                  {selected.requestNote && selected.type !== "return_cancel" && selected.type !== "order_cancel_approval" && (
                    <p className="whitespace-pre-wrap text-muted-foreground">{selected.requestNote}</p>
                  )}
                </div>
                {selected.status === "pending" ? (
                  <>
                    <Textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      placeholder="Finance note..."
                      className="min-h-28"
                    />
                    <div className="grid gap-2">
                      {!selected.orderMissing && (
                        <Button onClick={() => void review("approve")} disabled={busy !== null} className="gap-2">
                          {busy === "approve" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : selected.type === "return_cancel" ? (
                            <ExternalLink className="size-4" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                          {selected.type === "return_cancel"
                            ? "Mark processed (cancel in ERPNext)"
                            : selected.type === "order_cancel_approval"
                              ? "Confirm Cancel (Shopify + ERP done)"
                              : `Approve — ${typeLabel(selected.type)}`}
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => void review("reject")} disabled={busy !== null} className="gap-2">
                        {busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                        Reject
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
                      Reviewed by {selected.reviewedByName ?? selected.reviewedByEmail ?? "-"} on {formatDate(selected.reviewedAt)}.
                      {selected.reviewNote && <p className="mt-2 whitespace-pre-wrap">{selected.reviewNote}</p>}
                    </div>
                    {canRevertPaid && selected.orderId && !selected.orderMissing && selected.status === "approved" && selected.type === "delivery_payment_approval" && (
                      <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                        <p className="text-sm font-medium">Revert paid → unpaid (HOD only)</p>
                        <Input
                          type="password"
                          value={hodPassword}
                          onChange={(event) => setHodPassword(event.target.value)}
                          placeholder="HOD password"
                          disabled={busy !== null}
                          autoComplete="off"
                        />
                        <Textarea
                          value={revertReason}
                          onChange={(event) => setRevertReason(event.target.value)}
                          placeholder="Reason (optional)"
                          className="min-h-20"
                          disabled={busy !== null}
                        />
                        <Button
                          variant="outline"
                          onClick={() => void revertPaidToUnpaid()}
                          disabled={busy !== null}
                          className="gap-2"
                        >
                          {busy === "revert" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                          Revert to unpaid
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select an approval request.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
