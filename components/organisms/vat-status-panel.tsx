"use client";

import { FormEvent, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import type { VatStatusLookup, VatStatusSlot } from "@/lib/vat-status/types";

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
  const [result, setResult] = useState<VatStatusLookup | null>(null);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const query = sku.trim();
    if (!query) {
      notify.error("Enter a SKU");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/vat-status?sku=${encodeURIComponent(query)}`);
      const data = (await res.json()) as VatStatusLookup & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "VAT status lookup failed");
      }
      setResult(data);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "VAT status lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">VAT status</h2>
        <p className="text-muted-foreground text-sm">
          Live Item Manufacturing tax status from ERP1 and ERP2. Values are Vat, Non Vat, or Vat / Non Vat.
        </p>
      </div>
      <form className="flex max-w-xl gap-2" onSubmit={onSearch}>
        <Input
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          placeholder="Search by SKU"
          disabled={busy}
          autoComplete="off"
          aria-label="SKU"
        />
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
          <div className="grid gap-4 md:grid-cols-2">
            <SlotCard slot={result.erp1} />
            <SlotCard slot={result.erp2} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
