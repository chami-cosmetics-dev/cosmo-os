"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { NewItemRequestVoteDialog } from "@/components/organisms/new-item-request-vote-dialog";
import { NewItemRequestVoteList } from "@/components/organisms/new-item-request-vote-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { formatVoteCount, type NewItemRequestStatusValue, type NewItemRequestView } from "@/lib/new-item-requests/types";

const FILTERS: { id: NewItemRequestStatusValue; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "already_have", label: "Already have" },
  { id: "closed", label: "Closed" },
];

function statusLabel(status: NewItemRequestStatusValue) {
  if (status === "already_have") return "Already have";
  if (status === "closed") return "Closed";
  return "Open";
}

type NewItemRequestOwnListProps = {
  initialRequests: NewItemRequestView[];
  extraRequests?: NewItemRequestView[];
  canVote?: boolean;
};

export function NewItemRequestOwnList({
  initialRequests,
  extraRequests = [],
  canVote = true,
}: NewItemRequestOwnListProps) {
  const [status, setStatus] = useState<NewItemRequestStatusValue>("open");
  const [requests, setRequests] = useState(initialRequests);
  const [selected, setSelected] = useState<NewItemRequestView | null>(null);
  const [voting, setVoting] = useState<NewItemRequestView | null>(null);
  const [overrides, setOverrides] = useState<Record<string, NewItemRequestView>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null;
  const extrasById = new Map(extraRequests.map((row) => [row.id, row]));
  function resolveRow(row: NewItemRequestView) {
    return overrides[row.id] ?? extrasById.get(row.id) ?? row;
  }
  const shown = [
    ...extraRequests.filter((row) => row.status === status && !requests.some((item) => item.id === row.id)),
    ...requests,
  ].map(resolveRow);

  async function load(nextStatus: NewItemRequestStatusValue) {
    try {
      setBusyKey("list");
      const response = await fetch(`/api/new-item-requests?status=${nextStatus}`, { cache: "no-store" });
      const data = (await response.json()) as { requests?: NewItemRequestView[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load requests");
      setRequests(data.requests ?? []);
      setOverrides({});
      setSelected(null);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load requests");
    } finally {
      setBusyKey(null);
    }
  }

  async function openRow(id: string) {
    try {
      setBusyKey(id);
      const response = await fetch(`/api/new-item-requests/${id}`, { cache: "no-store" });
      const data = (await response.json()) as { request?: NewItemRequestView; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not open request");
      if (data.request) setSelected(data.request);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not open request");
    } finally {
      setBusyKey(null);
    }
  }

  function applyVoted(request: NewItemRequestView) {
    setOverrides((current) => ({ ...current, [request.id]: request }));
    setRequests((current) => current.map((row) => (row.id === request.id ? request : row)));
    setSelected((current) => (current?.id === request.id ? request : current));
  }

  async function unvote(id: string) {
    try {
      setBusyKey(`unvote-${id}`);
      const response = await fetch(`/api/new-item-requests/${id}/vote`, { method: "DELETE" });
      const data = (await response.json()) as { request?: NewItemRequestView; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not remove vote");
      if (!data.request) throw new Error("Could not remove vote");
      applyVoted(data.request);
      notify.success("Vote removed.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not remove vote");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All merchant requests</CardTitle>
        <CardDescription>Every shop sees the same list. Vote if the item is already here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.id}
              type="button"
              size="sm"
              variant={status === filter.id ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => {
                setStatus(filter.id);
                void load(filter.id);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        {busyKey === "list" ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading...
          </p>
        ) : null}
        {shown.length === 0 && busyKey !== "list" ? (
          <p className="text-muted-foreground text-sm">No requests in this filter.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((row) => (
              <li key={row.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  className="hover:bg-secondary/30 min-w-0 flex-1 rounded-lg border px-3 py-2 text-left"
                  disabled={isBusy}
                  onClick={() => void openRow(row.id)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{row.productName || row.brandName}</span>
                    <span className="text-muted-foreground text-xs">{statusLabel(row.status)}</span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {row.brandName}
                    {` · ${formatVoteCount(row)}`}
                    {` · ${formatAppDateTime(row.createdAt)}`}
                  </p>
                </button>
                {canVote && row.status === "open" && !row.hasVoted ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="self-center"
                    disabled={isBusy}
                    onClick={() => setVoting(row)}
                  >
                    Vote
                  </Button>
                ) : canVote && row.status === "open" && row.hasVoted ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="self-center"
                    disabled={isBusy}
                    onClick={() => void unvote(row.id)}
                  >
                    {busyKey === `unvote-${row.id}` ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      "Remove vote"
                    )}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {selected ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">{selected.productName}</p>
            <p className="text-muted-foreground text-xs">{selected.brandName}</p>
            {selected.description ? <p>{selected.description}</p> : null}
            <p className="text-muted-foreground">
              {selected.brandIsExisting ? "Catalogue brand" : "New brand"}
              {selected.priority ? ` · ${selected.priority}` : ""}
              {` · ${formatVoteCount(selected)}`}
              {` · ${statusLabel(selected.status)}`}
            </p>
            {selected.customerName || selected.customerPhone ? (
              <p className="text-muted-foreground text-xs">
                {[selected.customerName, selected.customerPhone].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <NewItemRequestVoteList votes={selected.votes} />
            {selected.storeUrl ? (
              <a className="text-primary underline" href={selected.storeUrl} target="_blank" rel="noreferrer">
                Other-store link
              </a>
            ) : null}
            {selected.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.imageUrl} alt="" className="max-h-48 rounded-md" />
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <NewItemRequestVoteDialog
        request={voting}
        open={voting !== null}
        onOpenChange={(open) => {
          if (!open) setVoting(null);
        }}
        onVoted={applyVoted}
      />
    </Card>
  );
}
