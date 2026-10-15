"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseVoucherCodeList, type OrderGiftVoucherApplied, type OrderGiftVoucherState } from "@/lib/gift-vouchers/types";
import { notify } from "@/lib/notify";

type Suggestion = { code: string; groupName: string };

/** The code currently being typed: whatever follows the last separator. */
function currentToken(text: string): string {
  const match = /[^\s,;]*$/.exec(text);
  return match ? match[0].trim().toUpperCase() : "";
}

/**
 * Gift voucher batch codes for an order. Shown only when one of the order's coupons matches a
 * voucher group prefix (or codes are already applied). Anyone who can view the order can apply
 * one or more codes at a time, and add more later; each apply is all-or-nothing.
 */
export function OrderGiftVoucherField({ orderId }: { orderId: string }) {
  const [state, setState] = useState<OrderGiftVoucherState | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => parseVoucherCodeList(text), [text]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const token = currentToken(text);
  const canSuggest = Boolean(state?.canApply && state.matchedCoupons.length > 0);

  // Suggest applicable codes for the part being typed, debounced.
  useEffect(() => {
    if (!canSuggest || !token) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/admin/orders/${orderId}/gift-voucher/suggest?q=${encodeURIComponent(token)}`)
        .then(async (res) => (res.ok ? ((await res.json()) as { suggestions: Suggestion[] }) : null))
        .then((data) => {
          if (cancelled) return;
          setSuggestions(data?.suggestions ?? []);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canSuggest, orderId, token]);

  // Hide codes already entered in the box or already applied.
  const visibleSuggestions = suggestions.filter(
    (s) => s.code !== token && !parsed.codes.includes(s.code) && !state?.applied.some((a) => a.code === s.code),
  );

  function pickSuggestion(code: string) {
    // Replace the partly typed code and start a new line for the next one.
    setText((prev) => `${prev.slice(0, prev.length - currentToken(prev).length)}${code}\n`);
    setSuggestions([]);
    setActiveIndex(-1);
    setError(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!suggestOpen || visibleSuggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % visibleSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? visibleSuggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      pickSuggestion(visibleSuggestions[activeIndex].code);
    } else if (event.key === "Escape") {
      setSuggestOpen(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setText("");
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
    if (!state || parsed.codes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/gift-voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: parsed.codes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not apply these batch codes");
        return;
      }
      const added = data.applied as OrderGiftVoucherApplied[];
      setState({ ...state, applied: [...state.applied, ...added] });
      setText("");
      notify.success(
        added.length === 1 ? `Batch code ${added[0].code} applied` : `${added.length} batch codes applied`,
      );
    } catch {
      setError("Could not apply these batch codes");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  const showForm = state.canApply && state.matchedCoupons.length > 0;
  if (state.applied.length === 0 && !showForm) return null;

  const inputError =
    parsed.invalid.length > 0
      ? `Not valid: ${parsed.invalid.slice(0, 5).join(", ")}`
      : parsed.duplicates.length > 0
        ? `Listed more than once: ${parsed.duplicates.slice(0, 5).join(", ")}`
        : null;

  return (
    <div className="space-y-2">
      <span className="text-muted-foreground text-xs">
        Gift voucher batch codes
        {state.matchedCoupons.length > 0 ? ` (${state.matchedCoupons.join(", ")})` : ""}
      </span>
      {state.applied.length > 0 ? (
        <ul className="space-y-0.5">
          {state.applied.map((row) => (
            <li key={row.code}>
              <span className="font-mono">{row.code}</span>
              <span className="text-muted-foreground ml-2 text-xs">{row.groupName}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {showForm ? (
        <form onSubmit={onApply} className="space-y-1">
          <div className="flex items-start gap-2">
            <div className="relative w-full max-w-64">
            <Textarea
              id={`gift-voucher-${orderId}`}
              aria-label="Batch codes"
              aria-autocomplete="list"
              aria-expanded={suggestOpen && visibleSuggestions.length > 0}
              aria-controls={`gift-voucher-suggestions-${orderId}`}
              value={text}
              onChange={(event) => {
                setText(event.target.value.toUpperCase());
                setSuggestOpen(true);
                setError(null);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
              autoComplete="off"
              placeholder={state.applied.length > 0 ? "Add more batch codes" : "Batch codes, one per line or comma-separated"}
              rows={2}
              className="min-h-0 w-full font-mono"
              disabled={busy}
              aria-invalid={Boolean(error || inputError)}
            />
            {suggestOpen && visibleSuggestions.length > 0 ? (
              <ul
                id={`gift-voucher-suggestions-${orderId}`}
                role="listbox"
                className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border p-1 shadow-md"
              >
                {visibleSuggestions.map((s, index) => (
                  <li
                    key={s.code}
                    role="option"
                    aria-selected={index === activeIndex}
                    // mousedown, not click, so the textarea blur doesn't close the list first.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickSuggestion(s.code);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex cursor-pointer items-baseline justify-between gap-2 rounded-sm px-2 py-1 text-sm ${index === activeIndex ? "bg-accent text-accent-foreground" : ""}`}
                  >
                    <span className="font-mono">{s.code}</span>
                    <span className="text-muted-foreground truncate text-xs">{s.groupName}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            </div>
            <Button type="submit" size="sm" disabled={busy || parsed.codes.length === 0 || Boolean(inputError)}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {parsed.codes.length > 1 ? `Apply ${parsed.codes.length} batch codes` : "Apply batch code"}
            </Button>
          </div>
          {inputError || error ? <p className="text-destructive text-xs">{inputError ?? error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
