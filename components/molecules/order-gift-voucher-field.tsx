"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderGiftVoucherState } from "@/lib/gift-vouchers/types";
import { notify } from "@/lib/notify";

/**
 * Gift voucher batch code for an order. Shown only when one of the order's coupons matches a
 * voucher group prefix (or a code is already applied). Managers can apply one code per order.
 */
export function OrderGiftVoucherField({ orderId }: { orderId: string }) {
  const [state, setState] = useState<OrderGiftVoucherState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setCode("");
    setError(null);
    fetch(`/api/admin/orders/${orderId}/gift-voucher`)
      .then(async (res) => (res.ok ? ((await res.json()) as OrderGiftVoucherState) : null))
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function onApply(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!value || !state) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/gift-voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not apply this batch code");
        return;
      }
      setState({ ...state, applied: data.applied });
      notify.success(`Batch code ${data.applied.code} applied`);
    } catch {
      setError("Could not apply this batch code");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  if (state.applied) {
    return (
      <div>
        <span className="text-muted-foreground text-xs">Gift voucher batch code</span>
        <p className="font-mono">{state.applied.code}</p>
        <p className="text-muted-foreground text-xs">{state.applied.groupName}</p>
      </div>
    );
  }

  if (state.matchedCoupons.length === 0 || !state.canApply) return null;

  return (
    <div>
      <label htmlFor={`gift-voucher-${orderId}`} className="text-muted-foreground text-xs">
        Gift voucher batch code ({state.matchedCoupons.join(", ")})
      </label>
      <form onSubmit={onApply} className="mt-1 flex gap-2">
        <Input
          id={`gift-voucher-${orderId}`}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="Batch code"
          className="h-8 max-w-48 font-mono"
          disabled={busy}
          aria-invalid={Boolean(error)}
        />
        <Button type="submit" size="sm" disabled={busy || !code.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Apply batch code
        </Button>
      </form>
      {error ? <p className="text-destructive mt-1 text-xs">{error}</p> : null}
    </div>
  );
}
