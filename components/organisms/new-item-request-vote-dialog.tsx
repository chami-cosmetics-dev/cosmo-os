"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { NewItemRequestView } from "@/lib/new-item-requests/types";
import { notify } from "@/lib/notify";

type NewItemRequestVoteDialogProps = {
  request: NewItemRequestView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoted: (request: NewItemRequestView) => void;
};

export function NewItemRequestVoteDialog({
  request,
  open,
  onOpenChange,
  onVoted,
}: NewItemRequestVoteDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
  }

  async function submit() {
    if (!request) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      notify.error("Customer name and phone are required.");
      return;
    }
    try {
      setBusy(true);
      const response = await fetch(`/api/new-item-requests/${request.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
        }),
      });
      const data = (await response.json()) as { request?: NewItemRequestView; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not vote");
      if (!data.request) throw new Error("Could not vote");
      reset();
      onVoted(data.request);
      onOpenChange(false);
      notify.success("Voted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not vote");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add vote</DialogTitle>
          <DialogDescription>
            {request ? `Customer details for ${request.productName}.` : "Customer details for this vote."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="vote-customer-name">
              Customer name
            </label>
            <Input
              id="vote-customer-name"
              value={customerName}
              disabled={busy}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="vote-customer-phone">
              Customer phone
            </label>
            <Input
              id="vote-customer-phone"
              value={customerPhone}
              disabled={busy}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="0771234567"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="vote-customer-email">
              Customer email (optional)
            </label>
            <Input
              id="vote-customer-email"
              type="email"
              value={customerEmail}
              disabled={busy}
              onChange={(event) => setCustomerEmail(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Voting...
              </>
            ) : (
              "Vote"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
