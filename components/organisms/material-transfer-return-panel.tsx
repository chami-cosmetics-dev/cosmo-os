"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { MaterialTransferQtyInput } from "@/components/organisms/material-transfer-qty-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  findTransferLine,
  promoteTransferLine,
  removeTransferLine,
  setTransferLineQty,
  upsertTransferLine,
} from "@/lib/material-transfer/lines";
import type { ShopReturnLeg } from "@/lib/material-transfer/shop-return";
import type { TransferLine, TransferLookupItem } from "@/lib/material-transfer/types";
import { notify } from "@/lib/notify";
import { playScanErrorSound, unlockScanSound } from "@/lib/store-stock-count/scan-sound";
import { cn } from "@/lib/utils";

type Setup = {
  legs: ShopReturnLeg[];
};

function slotLabel(slot: string | null | undefined) {
  if (slot === "erp1") return "ERP1 VAT";
  if (slot === "erp2") return "ERP2";
  return "—";
}

export function MaterialTransferReturnPanel() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [scan, setScan] = useState("");
  const [busyKey, setBusyKey] = useState<"page" | "lookup" | "submit" | null>("page");
  const [highlightedItemCode, setHighlightedItemCode] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const scanValueRef = useRef("");
  const linesRef = useRef<TransferLine[]>([]);
  linesRef.current = lines;
  const scanLocked = busyKey === "page" || busyKey === "submit";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/store/material-transfer/shop-return");
        const json = (await res.json()) as { legs?: ShopReturnLeg[]; error?: string };
        if (!res.ok || !json.legs?.length) throw new Error(json.error || "No shop warehouse is allocated");
        if (!cancelled) setSetup({ legs: json.legs });
      } catch (error) {
        if (!cancelled) setSetupError(error instanceof Error ? error.message : "No shop warehouse is allocated");
      } finally {
        if (!cancelled) setBusyKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyLookup = useCallback((item: TransferLookupItem) => {
    const result = upsertTransferLine(linesRef.current, item);
    if (result.rejected) {
      playScanErrorSound();
      notify.error("Cannot send more than available");
      return;
    }
    const next = promoteTransferLine(result.lines, item.itemCode);
    linesRef.current = next;
    setLines(next);
    setHighlightedItemCode(item.itemCode);
  }, []);

  async function addCode(raw: string) {
    const code = raw.trim();
    if (!code || !setup || scanLocked) return;
    scanValueRef.current = "";
    setScan("");
    setBusyKey("lookup");
    try {
      const existing = findTransferLine(linesRef.current, code);
      if (existing) {
        applyLookup({
          itemCode: existing.itemCode,
          itemName: existing.itemName,
          barcode: existing.barcode,
          uom: existing.uom,
          taxStatus: null,
          availableQty: existing.availableQty,
          slot: existing.slot,
        });
        return;
      }
      const res = await fetch("/api/admin/store/material-transfer/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as { item?: TransferLookupItem; error?: string };
      if (!res.ok || !json.item) throw new Error(json.error || "Item not found");
      applyLookup(json.item);
    } catch (error) {
      playScanErrorSound();
      notify.error(error instanceof Error ? error.message : "Item not found");
    } finally {
      setBusyKey(null);
      scanRef.current?.focus();
    }
  }

  async function send() {
    if (!setup) return;
    setBusyKey("submit");
    try {
      const res = await fetch("/api/admin/store/material-transfer/shop-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((line) => ({
            itemCode: line.itemCode,
            itemName: line.itemName,
            barcode: line.barcode,
            qty: line.qty,
            uom: line.uom,
          })),
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error || "Could not send the shop return");
      notify.success("Sent to stores. Nothing was posted in ERP.");
      setLines([]);
      setHighlightedItemCode(null);
      window.dispatchEvent(new Event("material-transfer-saved"));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not send the shop return");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="flex flex-col gap-3" onPointerDown={unlockScanSound}>
      <div>
        <h2 className="text-lg font-semibold">Send to main</h2>
        <p className="text-muted-foreground text-sm">
          Add every item on this list. Stores confirm it once. VAT items post to ERP1 and other items post to ERP2.
        </p>
      </div>
      {busyKey === "page" ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="animate-spin" aria-hidden />
          Loading warehouse...
        </p>
      ) : null}
      {setupError ? <p className="text-sm text-red-600">{setupError}</p> : null}
      {setup
        ? setup.legs.map((leg) => (
            <p key={leg.slot} className="text-sm">
              {slotLabel(leg.slot)}: {leg.sourceWarehouse} → {leg.targetWarehouse}
            </p>
          ))
        : null}
      {setup && !setupError ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addCode(scanRef.current?.value || scanValueRef.current || scan);
            }}
          >
            <Input
              ref={scanRef}
              value={scan}
              disabled={scanLocked}
              placeholder="Scan barcode or type SKU"
              autoComplete="off"
              onFocus={unlockScanSound}
              onChange={(event) => {
                scanValueRef.current = event.target.value;
                setScan(event.target.value);
              }}
            />
            <Button type="submit" disabled={scanLocked || !scan.trim()}>
              {busyKey === "lookup" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Adding...
                </>
              ) : (
                "Add"
              )}
            </Button>
          </form>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Barcode</th>
                  <th className="px-3 py-2 font-medium">Available</th>
                  <th className="px-3 py-2 font-medium">ERP</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td className="text-muted-foreground px-3 py-6" colSpan={7}>
                      No items yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr
                      key={line.itemCode}
                      className={cn(
                        "border-t",
                        highlightedItemCode === line.itemCode &&
                          "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
                        line.availableQty != null &&
                          line.qty === line.availableQty &&
                          "ring-2 ring-inset ring-green-500",
                      )}
                    >
                      <td className="px-3 py-2 font-medium">{line.itemCode}</td>
                      <td className="px-3 py-2">{line.itemName}</td>
                      <td className="px-3 py-2">{line.barcode || "—"}</td>
                      <td className="px-3 py-2">{line.availableQty ?? "—"}</td>
                      <td className="px-3 py-2">{slotLabel(line.slot)}</td>
                      <td className="px-3 py-2">
                        <MaterialTransferQtyInput
                          itemCode={line.itemCode}
                          qty={line.qty}
                          availableQty={line.availableQty}
                          disabled={busyKey !== null}
                          onQty={(qty) =>
                            setLines((prev) => setTransferLineQty(prev, line.itemCode, qty).lines)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${line.itemCode}`}
                          onClick={() => setLines((prev) => removeTransferLine(prev, line.itemCode))}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button type="button" disabled={busyKey !== null || lines.length === 0} onClick={() => void send()}>
              {busyKey === "submit" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Sending...
                </>
              ) : (
                "Send to stores"
              )}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
