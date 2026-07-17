"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquareWarning, RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ComplaintItem, ComplaintStatus } from "@/lib/page-data/complaints";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";

type ComplaintsPanelProps = {
  initialComplaints: ComplaintItem[];
  canCreate: boolean;
  canManage: boolean;
  canReadAll: boolean;
};

const statusLabels: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

function formatDateTime(value: string) {
  return formatAppDateTime(value, value);
}

function statusClass(status: ComplaintStatus) {
  if (status === "resolved") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700";
  if (status === "in_progress") return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  return "border-sky-500/40 bg-sky-500/10 text-sky-700";
}

export function ComplaintsPanel({
  initialComplaints,
  canCreate,
  canManage,
  canReadAll,
}: ComplaintsPanelProps) {
  const [complaints, setComplaints] = useState(initialComplaints);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "all">("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function refresh(nextStatus = statusFilter) {
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    const response = await fetch(`/api/admin/complaints?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json()) as { error?: string; complaints?: ComplaintItem[] };
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to load complaints");
    }
    setComplaints(data.complaints ?? []);
  }

  async function submitComplaint() {
    if (!title.trim() || !description.trim()) {
      notify.error("Title and description are required.");
      return;
    }

    try {
      setBusyKey("create");
      const response = await fetch("/api/admin/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create complaint");
      }
      setTitle("");
      setDescription("");
      await refresh();
      notify.success("Complaint submitted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to create complaint");
    } finally {
      setBusyKey(null);
    }
  }

  async function updateComplaint(complaint: ComplaintItem, status: ComplaintStatus) {
    try {
      setBusyKey(complaint.id);
      const response = await fetch(`/api/admin/complaints/${complaint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          resolution: status === "resolved" ? "Marked resolved from complaints panel" : complaint.resolution,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update complaint");
      }
      await refresh();
      notify.success("Complaint updated.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to update complaint");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Complaints</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Merchant Complaints</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Merchants can raise internal complaints. Assigned reviewers can track and resolve them.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm">
            {canReadAll ? "Viewing team complaints" : "Viewing your complaints"}
          </div>
        </div>
      </section>

      {canCreate && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <MessageSquareWarning className="size-5" />
              Create Complaint
            </CardTitle>
            <CardDescription>Submit the issue clearly so the reviewing person can act on it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short complaint title"
              maxLength={120}
            />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explain what happened..."
              className="min-h-32"
              maxLength={2000}
            />
            <Button onClick={submitComplaint} disabled={busyKey === "create"}>
              {busyKey === "create" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Submit Complaint
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Complaint List</CardTitle>
              <CardDescription>Open, in-progress, and resolved complaints.</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={statusFilter}
                onValueChange={async (value) => {
                  const next = value as ComplaintStatus | "all";
                  setStatusFilter(next);
                  try {
                    await refresh(next);
                  } catch (error) {
                    notify.error(error instanceof Error ? error.message : "Failed to load complaints");
                  }
                }}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    setBusyKey("refresh");
                    await refresh();
                  } catch (error) {
                    notify.error(error instanceof Error ? error.message : "Failed to load complaints");
                  } finally {
                    setBusyKey(null);
                  }
                }}
              >
                <RefreshCw className={`mr-2 size-4 ${busyKey === "refresh" ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {complaints.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No complaints found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b bg-muted/35 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Complaint</th>
                    <th className="px-4 py-3 font-medium">Created By</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Resolution</th>
                    {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((complaint) => (
                    <tr key={complaint.id} className="border-b align-top last:border-0">
                      <td className="max-w-md px-4 py-3">
                        <div className="font-medium">{complaint.title}</div>
                        <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{complaint.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{complaint.createdByName ?? "Unknown user"}</div>
                        <div className="text-xs text-muted-foreground">{complaint.createdByEmail ?? complaint.createdById}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(complaint.status)}`}>
                          {statusLabels[complaint.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(complaint.createdAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {complaint.resolution || "-"}
                        {complaint.resolvedAt && (
                          <div className="mt-1 text-xs">Resolved {formatDateTime(complaint.resolvedAt)}</div>
                        )}
                      </td>
                      {canManage && (
                        <td className="space-y-2 px-4 py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateComplaint(complaint, "in_progress")}
                            disabled={busyKey === complaint.id || complaint.status === "in_progress"}
                          >
                            In Progress
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => updateComplaint(complaint, "resolved")}
                            disabled={busyKey === complaint.id || complaint.status === "resolved"}
                            className="ml-2"
                          >
                            {busyKey === complaint.id ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 size-4" />
                            )}
                            Resolve
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
