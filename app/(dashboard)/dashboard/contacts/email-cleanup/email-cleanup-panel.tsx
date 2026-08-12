"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MailWarning, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";
import type { ContactEmailCleanupReason } from "@/lib/validation/contact-email-cleanup";

type ReviewItem = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  matchedEmail: string;
  reason: ContactEmailCleanupReason;
};

type ListResponse = {
  items: ReviewItem[];
  page: number;
  pageSize: number;
  total: number;
};

const REASON_TABS: Array<{ value: ContactEmailCleanupReason; label: string; description: string }> = [
  {
    value: "invalid",
    label: "Invalid format",
    description: "Primary or secondary emails that fail email-shape validation.",
  },
  {
    value: "cosmetics_pattern",
    label: "Cosmetics pattern",
    description: "Emails containing cosmetic, cosmetics, or cosmatics anywhere in the address.",
  },
];

export function EmailCleanupPanel() {
  const [reason, setReason] = useState<ContactEmailCleanupReason>("invalid");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isBusy = busyKey !== null;
  const pageSize = 50;

  const loadList = useCallback(async () => {
    setBusyKey("load");
    try {
      const params = new URLSearchParams({
        reason,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/admin/contacts/email-cleanup?${params.toString()}`);
      const json = (await res.json()) as ListResponse & { error?: unknown };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Failed to load email cleanup list"
        );
      }
      setData(json);
      setSelected(new Set());
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load list");
      setData({ items: [], page: 1, pageSize, total: 0 });
    } finally {
      setBusyKey(null);
    }
  }, [page, reason]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data]);

  const toggleOne = (contactId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(contactId);
      else next.delete(contactId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (!data) return;
    setSelected(checked ? new Set(data.items.map((row) => row.contactId)) : new Set());
  };

  const allSelected =
    !!data && data.items.length > 0 && data.items.every((row) => selected.has(row.contactId));

  const runClear = async () => {
    if (selected.size === 0) return;
    setBusyKey("clear");
    try {
      const res = await fetch("/api/admin/contacts/email-cleanup/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          contactIds: [...selected],
        }),
      });
      const json = (await res.json()) as {
        cleared?: number;
        skipped?: Array<{ contactId: string; error: string }>;
        error?: unknown;
      };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Failed to clear emails"
        );
      }
      notify.success(`Cleared emails on ${json.cleared ?? 0} contact(s).`);
      if (json.skipped?.length) {
        notify.error(`${json.skipped.length} contact(s) skipped (no longer matched).`);
      }
      setConfirmOpen(false);
      await loadList();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to clear emails");
    } finally {
      setBusyKey(null);
    }
  };

  const activeTab = REASON_TABS.find((tab) => tab.value === reason)!;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MailWarning className="size-5" aria-hidden />
            Email cleanup
          </CardTitle>
          <CardDescription>
            Review and remove invalid or company-pattern emails from contacts. Only matching
            addresses are cleared; valid emails on the same contact are kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {REASON_TABS.map((tab) => (
              <Button
                key={tab.value}
                type="button"
                variant={reason === tab.value ? "default" : "outline"}
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  setReason(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{activeTab.description}</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={isBusy || selected.size === 0}
              onClick={() => setConfirmOpen(true)}
            >
              {busyKey === "clear" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" aria-hidden />
                  Remove selected ({selected.size})
                </>
              )}
            </Button>
            <Button type="button" variant="outline" disabled={isBusy} onClick={() => void loadList()}>
              {busyKey === "load" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Refreshing...
                </>
              ) : (
                "Refresh"
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              {data ? `${data.total} match(es)` : "—"}
            </span>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="size-4 rounded border border-input"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      disabled={isBusy || !data?.items.length}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Primary email</TableHead>
                  <TableHead>Flagged email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {busyKey === "load" && !data ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" aria-hidden />
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : data && data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No contacts match {activeTab.label.toLowerCase()}.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items.map((row) => (
                    <TableRow key={`${row.contactId}-${row.matchedEmail}`}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 rounded border border-input"
                          checked={selected.has(row.contactId)}
                          onChange={(e) => toggleOne(row.contactId, e.target.checked)}
                          disabled={isBusy}
                          aria-label={`Select ${row.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.phoneNumber ?? "—"}</TableCell>
                      <TableCell>{row.email ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{row.matchedEmail}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove matching emails?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears only {activeTab.label.toLowerCase()} matches on {selected.size}{" "}
              selected contact(s). Contacts are not deleted. Valid emails on the same contact are
              kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={isBusy} onClick={() => void runClear()}>
              {busyKey === "clear" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Removing...
                </>
              ) : (
                "Confirm remove"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
