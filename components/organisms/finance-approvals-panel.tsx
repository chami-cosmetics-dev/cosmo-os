"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

export type FinanceApprovalItem = {
  id: string;
  type: string;
  status: string;
  invoiceNo: string | null;
  totalPrice: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  requestNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  reviewedByName: string | null;
  reviewedByEmail: string | null;
};

function typeLabel(type: string) {
  if (type === "order_payment_approval") return "Order Payment";
  if (type === "return_rearrange_payment") return "Return Rearrange";
  return type;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-LK");
}

function formatAmount(value: string | null) {
  if (!value) return "-";
  const amount = Number.parseFloat(value);
  return Number.isNaN(amount) ? value : amount.toLocaleString("en-LK", { minimumFractionDigits: 2 });
}

function statusClass(status: string) {
  if (status === "approved") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (status === "rejected") return "border-rose-500/30 bg-rose-500/10 text-rose-700";
  return "border-amber-500/30 bg-amber-500/10 text-amber-700";
}

export function FinanceApprovalsPanel({ initialApprovals }: { initialApprovals: FinanceApprovalItem[] }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [selectedId, setSelectedId] = useState(initialApprovals[0]?.id ?? "");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState<"refresh" | "approve" | "reject" | null>(null);
  const selected = approvals.find((item) => item.id === selectedId) ?? null;

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
      if (!selectedId && data.approvals?.[0]) setSelectedId(data.approvals[0].id);
    } catch {
      notify.error("Failed to load approvals");
    } finally {
      setBusy(null);
    }
  }

  async function review(action: "approve" | "reject") {
    if (!selected) return;
    setBusy(action);
    try {
      const response = await fetch(`/api/admin/approvals/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: reviewNote.trim() || null }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to review approval");
        return;
      }
      notify.success(action === "approve" ? "Approval granted." : "Approval rejected.");
      setReviewNote("");
      await refresh();
    } catch {
      notify.error("Failed to review approval");
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
            Review payment approval requests for KOKO, bank transfer, and return rearrangement orders.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={busy !== null} className="gap-2">
          <RefreshCw className={`size-4 ${busy === "refresh" ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b bg-muted/35 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-medium">Invoice</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Amount</th>
                    <th className="px-3 py-3 font-medium">Customer</th>
                    <th className="px-3 py-3 font-medium">Requested By</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((approval) => (
                    <tr
                      key={approval.id}
                      className={`cursor-pointer border-b last:border-0 hover:bg-muted/35 ${selectedId === approval.id ? "bg-primary/8" : ""}`}
                      onClick={() => {
                        setSelectedId(approval.id);
                        setReviewNote("");
                      }}
                    >
                      <td className="px-3 py-3 font-medium">{approval.invoiceNo ?? "-"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{typeLabel(approval.type)}</td>
                      <td className="px-3 py-3">{formatAmount(approval.totalPrice)}</td>
                      <td className="px-3 py-3">{approval.customerPhone ?? approval.customerEmail ?? "-"}</td>
                      <td className="px-3 py-3">{approval.requestedByName ?? approval.requestedByEmail ?? "-"}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(approval.status)}`}>
                          {approval.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDate(approval.createdAt)}</td>
                    </tr>
                  ))}
                  {approvals.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        No approval requests.
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
                  <p><span className="font-medium">Invoice:</span> {selected.invoiceNo ?? "-"}</p>
                  <p><span className="font-medium">Amount:</span> {formatAmount(selected.totalPrice)}</p>
                  <p><span className="font-medium">Customer:</span> {selected.customerPhone ?? selected.customerEmail ?? "-"}</p>
                  <p><span className="font-medium">Requested:</span> {formatDate(selected.createdAt)}</p>
                  {selected.requestNote && (
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
                      <Button onClick={() => void review("approve")} disabled={busy !== null} className="gap-2">
                        {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                        Approve — {typeLabel(selected.type)}
                      </Button>
                      <Button variant="outline" onClick={() => void review("reject")} disabled={busy !== null} className="gap-2">
                        {busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                        Reject
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
                    Reviewed by {selected.reviewedByName ?? selected.reviewedByEmail ?? "-"} on {formatDate(selected.reviewedAt)}.
                    {selected.reviewNote && <p className="mt-2 whitespace-pre-wrap">{selected.reviewNote}</p>}
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
