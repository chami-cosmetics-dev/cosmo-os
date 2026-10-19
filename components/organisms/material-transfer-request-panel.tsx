"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { ShopRequestLines } from "@/components/organisms/shop-request-lines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shopAvailabilityWarn, type ShopRequestLineView, type ShopRequestView } from "@/lib/material-transfer/shop-item-request";
import { notify } from "@/lib/notify";
import { playScanErrorSound, unlockScanSound } from "@/lib/store-stock-count/scan-sound";

type Hit = { itemCode: string; itemName: string };
type StatusFilter = "pending" | "done";

function NeededQtyInput({
  itemCode,
  qty,
  disabled,
  onQty,
}: {
  itemCode: string;
  qty: number;
  disabled: boolean;
  onQty: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      className="w-24"
      inputMode="numeric"
      value={draft ?? String(qty)}
      disabled={disabled}
      aria-label={`Needed qty for ${itemCode}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const raw = draft ?? String(qty);
        setDraft(null);
        if (raw !== String(qty)) onQty(raw);
      }}
    />
  );
}

export function MaterialTransferRequestPanel() {
  const [code, setCode] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [lines, setLines] = useState<ShopRequestLineView[]>([]);
  const [busyKey, setBusyKey] = useState<"lookup" | "submit" | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [history, setHistory] = useState<ShopRequestView[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const isBusy = busyKey !== null;

  const loadHistory = useCallback(async (next: StatusFilter) => {
    setHistoryBusy(true);
    try {
      const res = await fetch(`/api/admin/store/material-transfer/shop-requests?status=${next}&scope=shop`);
      const json = (await res.json()) as { requests?: ShopRequestView[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not load requests");
      setHistory(json.requests ?? []);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load requests");
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(status);
  }, [loadHistory, status]);

  useEffect(() => {
    const q = code.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/admin/store/material-transfer/shop-requests/suggest?q=${encodeURIComponent(q)}`,
          );
          const json = (await res.json()) as { hits?: Hit[]; error?: string };
          if (!res.ok) throw new Error(json.error || "Could not search items");
          setHits(json.hits ?? []);
        } catch (error) {
          setHits([]);
          notify.error(error instanceof Error ? error.message : "Could not search items");
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [code]);

  async function addCode(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isBusy) return;
    setBusyKey("lookup");
    try {
      const res = await fetch("/api/admin/store/material-transfer/shop-requests/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = (await res.json()) as { item?: ShopRequestLineView; error?: string };
      if (!res.ok || !json.item) {
        playScanErrorSound();
        throw new Error(json.error || "Item was not found");
      }
      const item = { ...json.item, neededQty: 1 };
      if (shopAvailabilityWarn(item.shopAvailability)) {
        playScanErrorSound();
        notify.error("This item is not allowed for shops");
      }
      setLines((current) => {
        const existing = current.find((line) => line.itemCode === item.itemCode);
        if (!existing) return [item, ...current];
        return current.map((line) =>
          line.itemCode === item.itemCode
            ? { ...line, neededQty: Math.min(100_000, line.neededQty + 1), stocks: item.stocks }
            : line,
        );
      });
      setCode("");
      setHits([]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Item was not found");
    } finally {
      setBusyKey(null);
    }
  }

  function setQty(itemCode: string, raw: string) {
    const qty = Number(raw);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) {
      notify.error("Enter a whole number from 1");
      return;
    }
    setLines((current) => current.map((line) => (line.itemCode === itemCode ? { ...line, neededQty: qty } : line)));
  }

  async function submit() {
    if (lines.length === 0 || isBusy) return;
    setBusyKey("submit");
    try {
      const res = await fetch("/api/admin/store/material-transfer/shop-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((line) => ({ itemCode: line.itemCode, neededQty: line.neededQty })),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save the request");
      notify.success("Request sent");
      setLines([]);
      setStatus("pending");
      await loadHistory("pending");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not save the request");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-6" onPointerDown={unlockScanSound}>
      <div>
        <h2 className="text-lg font-semibold">Request items</h2>
        <p className="text-muted-foreground text-sm">
          Ask stores for items. Scan a barcode or pick a SKU. Not allowed and low main-warehouse stock can still be requested.
        </p>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void addCode(code);
        }}
      >
        <div className="flex gap-2">
          <Input
            value={code}
            disabled={isBusy}
            placeholder="Barcode or SKU"
            aria-label="Barcode or SKU"
            onChange={(event) => setCode(event.target.value)}
          />
          <Button type="submit" disabled={isBusy || !code.trim()}>
            {busyKey === "lookup" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Adding...
              </>
            ) : (
              "Add"
            )}
          </Button>
        </div>
        {hits.length > 0 ? (
          <ul className="rounded-md border">
            {hits.map((hit) => (
              <li key={hit.itemCode}>
                <button
                  type="button"
                  className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                  disabled={isBusy}
                  onClick={() => void addCode(hit.itemCode)}
                >
                  {hit.itemCode}
                  <span className="text-muted-foreground"> · {hit.itemName}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {lines.length > 0 ? (
        <div className="flex flex-col gap-3">
          {lines.map((line) => (
            <div key={line.itemCode} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ShopRequestLines lines={[line]} />
                {line.shopAvailability === "not_allowed" ? (
                  <p className="text-sm text-amber-800 dark:text-amber-200">This item is not allowed for shops</p>
                ) : null}
              </div>
              <NeededQtyInput
                itemCode={line.itemCode}
                qty={line.neededQty}
                disabled={isBusy}
                onQty={(raw) => setQty(line.itemCode, raw)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                aria-label={`Remove ${line.itemCode}`}
                onClick={() => setLines((current) => current.filter((row) => row.itemCode !== line.itemCode))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button type="button" disabled={isBusy || lines.length === 0} onClick={() => void submit()}>
            {busyKey === "submit" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Sending...
              </>
            ) : (
              "Send request"
            )}
          </Button>
        </div>
      ) : (
        <Button type="button" disabled>
          Send request
        </Button>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button type="button" variant={status === "pending" ? "default" : "outline"} disabled={isBusy || historyBusy} onClick={() => setStatus("pending")}>
            Pending
          </Button>
          <Button type="button" variant={status === "done" ? "default" : "outline"} disabled={isBusy || historyBusy} onClick={() => setStatus("done")}>
            Done
          </Button>
        </div>
        {historyBusy ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="animate-spin" aria-hidden />
            Loading...
          </p>
        ) : history.length === 0 ? (
          <p className="text-muted-foreground text-sm">No {status} requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((request) => (
              <li key={request.id} className="rounded-md border p-3">
                <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === request.id ? null : request.id)}>
                  <span className="font-medium">{request.createdByName ?? "Unknown"}</span>
                  <span className="text-muted-foreground"> · {request.outletName}</span>
                  <span className="text-muted-foreground"> · {new Date(request.createdAt).toLocaleString()}</span>
                </button>
                {openId === request.id ? (
                  <div className="mt-2">
                    <ShopRequestLines lines={request.lines} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
