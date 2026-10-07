"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import type { VatStatusLookup, VatStatusSlot } from "@/lib/vat-status/types";

type SkuSuggestion = {
  sku: string;
  title: string;
};

function statusText(slot: VatStatusSlot): string {
  if (!slot.configured) return "ERP not configured";
  if (slot.error) return "Could not read this ERP";
  if (!slot.found) return "SKU not on this ERP";
  return slot.taxStatus ?? "Tax status not set";
}

function membershipText(slot: VatStatusSlot): string | null {
  if (!slot.configured || slot.error || !slot.found || !slot.taxStatus) return null;
  return slot.vat ? "VAT" : "Non-VAT";
}

function SlotCard({ slot }: { slot: VatStatusSlot }) {
  const membership = membershipText(slot);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{slot.id === "erp1" ? "ERP1" : "ERP2"}</CardTitle>
        <CardDescription>{slot.label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Tax status</p>
          <p className="text-base font-medium">{statusText(slot)}</p>
        </div>
        {membership ? (
          <p className="font-medium">{membership}</p>
        ) : null}
        {slot.itemName ? (
          <div>
            <p className="text-muted-foreground">Item name</p>
            <p>{slot.itemName}</p>
          </div>
        ) : null}
        {slot.error ? <p className="text-destructive">{slot.error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function VatStatusPanel() {
  const [sku, setSku] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SkuSuggestion[]>([]);
  const [suggestSettled, setSuggestSettled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [result, setResult] = useState<VatStatusLookup | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const query = sku.trim();
    if (query.length < 1) {
      setSuggestions([]);
      setSuggesting(false);
      setSuggestSettled(false);
      return;
    }

    setSuggestSettled(false);

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await fetch(
          `/api/admin/products/vat-status/suggest?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as { suggestions?: SkuSuggestion[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "SKU suggestions failed");
        setSuggestions(data.suggestions ?? []);
        setActiveIndex(-1);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) {
          setSuggesting(false);
          setSuggestSettled(true);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [sku, open]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function lookup(raw: string) {
    const query = raw.trim();
    if (!query) {
      notify.error("Enter a SKU");
      return;
    }

    setOpen(false);
    setSku(query);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/vat-status?sku=${encodeURIComponent(query)}`);
      const data = (await res.json()) as VatStatusLookup & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "VAT status lookup failed");
      }
      setResult(data);
      setFetchedAt(new Date());
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "VAT status lookup failed");
    } finally {
      setBusy(false);
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    if (open && activeIndex >= 0 && suggestions[activeIndex]) {
      void lookup(suggestions[activeIndex].sku);
      return;
    }
    void lookup(sku);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showList =
    open && sku.trim().length > 0 && (suggesting || suggestSettled || suggestions.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">VAT status</h2>
        <p className="text-muted-foreground text-sm">
          Live Item Manufacturing tax status from ERP1 and ERP2. Values are Vat, Non Vat, or Vat / Non Vat.
        </p>
      </div>
      <form className="flex max-w-xl gap-2" onSubmit={onSearch}>
        <div className="relative min-w-0 flex-1" ref={boxRef}>
          <Input
            value={sku}
            onChange={(event) => {
              setSku(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search by SKU"
            disabled={busy}
            autoComplete="off"
            aria-label="SKU"
            aria-autocomplete="list"
            aria-expanded={showList}
            role="combobox"
          />
          {showList ? (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
              {suggesting && suggestions.length === 0 ? (
                <li className="text-muted-foreground px-3 py-2 text-sm">Searching SKUs...</li>
              ) : null}
              {suggestions.map((item, index) => (
                <li key={item.sku}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                      index === activeIndex ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => void lookup(item.sku)}
                  >
                    <span className="font-medium">{item.sku}</span>
                    {item.title ? (
                      <span className="text-muted-foreground line-clamp-1 text-xs">{item.title}</span>
                    ) : null}
                  </button>
                </li>
              ))}
              {!suggesting && suggestions.length === 0 ? (
                <li className="text-muted-foreground px-3 py-2 text-sm">No matching SKUs</li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Searching...
            </>
          ) : (
            <>
              <Search aria-hidden />
              Search
            </>
          )}
        </Button>
      </form>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">SKU {result.sku}</p>
          {fetchedAt ? (
            <p className="text-muted-foreground text-xs">
              Read from ERP at {fetchedAt.toLocaleTimeString()}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <SlotCard slot={result.erp1} />
            <SlotCard slot={result.erp2} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
