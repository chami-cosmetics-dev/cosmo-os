"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearAvailableQty,
  findTransferLine,
  removeTransferLine,
  setTransferLineQty,
  upsertTransferLine,
} from "@/lib/material-transfer/lines";
import type {
  TransferLine,
  TransferLookupItem,
  TransferSlot,
  TransferWarehouse,
} from "@/lib/material-transfer/types";
import {
  companiesForErp2,
  defaultSourceWarehouse,
  defaultTargetWarehouse,
  warehouseOptions,
} from "@/lib/material-transfer/warehouses";
import { MaterialTransferHistory } from "@/components/organisms/material-transfer-history";
import { notify } from "@/lib/notify";
import { playScanErrorSound, unlockScanSound } from "@/lib/store-stock-count/scan-sound";

type SlotPayload = {
  configured: boolean;
  label: string | null;
  warehouses: TransferWarehouse[];
  error: string | null;
};

type PageData = {
  erp1: SlotPayload;
  erp2: SlotPayload;
};

function slotLabel(slot: TransferSlot) {
  return slot === "erp1" ? "ERP1" : "ERP2";
}

export function MaterialTransferPanel() {
  const [page, setPage] = useState<PageData | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [slot, setSlot] = useState<TransferSlot>("erp1");
  const [company, setCompany] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [scan, setScan] = useState("");
  const [busyKey, setBusyKey] = useState<"page" | "lookup" | "submit" | null>("page");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const scanValueRef = useRef("");
  const linesRef = useRef<TransferLine[]>([]);
  const queueRef = useRef<
    Array<{ code: string; slot: TransferSlot; source: string; company: string }>
  >([]);
  const drainingRef = useRef(false);
  linesRef.current = lines;
  const isBusy = busyKey !== null;
  const scanLocked = busyKey === "page" || busyKey === "submit";

  const current = slot === "erp1" ? page?.erp1 : page?.erp2;
  const companies = useMemo(
    () => companiesForErp2(page?.erp2.warehouses ?? []),
    [page?.erp2.warehouses],
  );
  const options = useMemo(
    () => warehouseOptions(slot, current?.warehouses ?? [], slot === "erp2" ? company : null),
    [slot, current?.warehouses, company],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/store/material-transfer/page-data");
        const json = (await res.json()) as PageData & { error?: string };
        if (!res.ok) throw new Error(json.error || "Could not load warehouses");
        if (cancelled) return;
        setPage(json);
        setSlot(json.erp1.configured ? "erp1" : "erp2");
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Could not load warehouses";
          setPageError(message);
          notify.error(message);
        }
      } finally {
        if (!cancelled) setBusyKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const focusScan = useCallback(() => {
    scanRef.current?.focus();
  }, []);

  function switchSlot(next: TransferSlot) {
    if (next === slot || isBusy) return;
    setSlot(next);
    setCompany("");
    setSource("");
    setTarget("");
    setLines([]);
    setScan("");
  }

  function chooseCompany(next: string) {
    const nextOptions = warehouseOptions("erp2", page?.erp2.warehouses ?? [], next);
    setCompany(next);
    setSource(defaultSourceWarehouse(nextOptions));
    setTarget(defaultTargetWarehouse(nextOptions));
    setLines((prev) => clearAvailableQty(prev));
  }

  function chooseSource(next: string) {
    setSource(next);
    setLines((prev) => clearAvailableQty(prev));
  }

  const applyLookup = useCallback((item: TransferLookupItem) => {
    const next = upsertTransferLine(linesRef.current, item);
    linesRef.current = next;
    setLines(next);
  }, []);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    setBusyKey("lookup");
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift();
        if (!job) break;
        const existing = findTransferLine(linesRef.current, job.code);
        if (existing) {
          applyLookup({
            itemCode: existing.itemCode,
            itemName: existing.itemName,
            barcode: existing.barcode,
            uom: existing.uom,
            taxStatus: null,
            availableQty: existing.availableQty,
          });
          continue;
        }
        try {
          const res = await fetch("/api/admin/store/material-transfer/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slot: job.slot,
              code: job.code,
              sourceWarehouse: job.source,
              company: job.slot === "erp2" ? job.company : undefined,
            }),
          });
          const json = (await res.json()) as { item?: TransferLookupItem; error?: string };
          if (!res.ok || !json.item) throw new Error(json.error || "Item not found");
          applyLookup(json.item);
        } catch (error) {
          playScanErrorSound();
          notify.error(error instanceof Error ? error.message : "Item not found");
        }
      }
    } finally {
      drainingRef.current = false;
      setBusyKey((current) => (current === "lookup" ? null : current));
      focusScan();
    }
  }, [applyLookup, focusScan]);

  function addCode(raw: string) {
    const code = raw.trim();
    if (!code || scanLocked) return;
    if (slot === "erp2" && !company) {
      notify.error("Select a company first");
      playScanErrorSound();
      return;
    }
    if (!source) {
      notify.error("Select a source warehouse first");
      playScanErrorSound();
      return;
    }
    scanValueRef.current = "";
    setScan("");
    queueRef.current.push({ code, slot, source, company });
    void drainQueue();
    focusScan();
  }

  async function submit() {
    setBusyKey("submit");
    try {
      const res = await fetch("/api/admin/store/material-transfer/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          company: slot === "erp2" ? company : undefined,
          sourceWarehouse: source,
          targetWarehouse: target,
          lines: lines.map((line) => ({
            itemCode: line.itemCode,
            itemName: line.itemName,
            barcode: line.barcode,
            qty: line.qty,
            uom: line.uom,
          })),
        }),
      });
      const json = (await res.json()) as { name?: string; error?: string; receiptError?: string | null };
      if (!res.ok || !json.name) throw new Error(json.error || "ERP rejected the transfer");
      notify.success(`Submitted ${json.name}`);
      if (json.receiptError) notify.error(json.receiptError);
      window.dispatchEvent(new Event("material-transfer-saved"));
      setLines([]);
      setScan("");
      setConfirmOpen(false);
      focusScan();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "ERP rejected the transfer");
    } finally {
      setBusyKey(null);
    }
  }

  const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
  const canSend =
    !isBusy &&
    Boolean(source) &&
    Boolean(target) &&
    source !== target &&
    lines.length > 0 &&
    (slot === "erp1" || Boolean(company));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Material transfer</h1>
        <p className="text-muted-foreground text-sm">
          Stock Entry type Material Transfer. Scan a barcode or type a SKU. A repeat scan adds 1
          to the qty. Sending submits the entry in ERP and moves stock.
        </p>
      </div>

      {busyKey === "page" ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="animate-spin" aria-hidden />
          Loading warehouses...
        </p>
      ) : null}
      {pageError ? <p className="text-sm text-red-600">{pageError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={slot === "erp1" ? "default" : "outline"}
          disabled={isBusy || !page?.erp1.configured}
          onClick={() => switchSlot("erp1")}
        >
          ERP1 VAT items
        </Button>
        <Button
          type="button"
          variant={slot === "erp2" ? "default" : "outline"}
          disabled={isBusy || !page?.erp2.configured}
          onClick={() => switchSlot("erp2")}
        >
          ERP2 all items
        </Button>
      </div>

      {current?.error ? <p className="text-sm text-red-600">{current.error}</p> : null}
      {page && current && !current.configured ? (
        <p className="text-sm text-red-600">{slotLabel(slot)} is not configured.</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {slot === "erp2" ? (
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Company
            <Select value={company || undefined} onValueChange={chooseCompany} disabled={isBusy}>
              <SelectTrigger>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Source warehouse
          <Select
            value={source || undefined}
            onValueChange={chooseSource}
            disabled={isBusy || options.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {options.map((row) => (
                <SelectItem key={row.name} value={row.name}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">
            {slot === "erp1"
              ? "Every ERP1 warehouse."
              : "Defaults to the main warehouse. Main and shop warehouses are listed."}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Target warehouse
          <Select
            value={target || undefined}
            onValueChange={setTarget}
            disabled={isBusy || options.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select target" />
            </SelectTrigger>
            <SelectContent>
              {options.map((row) => (
                <SelectItem key={row.name} value={row.name}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">
            {slot === "erp1"
              ? "Every ERP1 warehouse."
              : "Defaults to the shop warehouse. Change it any time."}
          </span>
        </label>
      </div>

      {source && target && source === target ? (
        <p className="text-sm text-red-600">Source and target warehouse must be different.</p>
      ) : null}

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
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td className="text-muted-foreground px-3 py-6" colSpan={6}>
                  No items yet.
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <tr key={line.itemCode} className="border-t">
                  <td className="px-3 py-2 font-medium">{line.itemCode}</td>
                  <td className="px-3 py-2">{line.itemName}</td>
                  <td className="px-3 py-2">{line.barcode || "—"}</td>
                  <td className="px-3 py-2">{line.availableQty ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Input
                      className="w-24"
                      inputMode="numeric"
                      value={String(line.qty)}
                      disabled={isBusy}
                      aria-label={`Qty for ${line.itemCode}`}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        if (!digits) return;
                        const qty = Number(digits);
                        setLines((prev) => setTransferLineQty(prev, line.itemCode, qty));
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isBusy}
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {lines.length} items, {totalQty} units
        </p>
        <Button type="button" disabled={!canSend} onClick={() => setConfirmOpen(true)}>
          Send to ERP
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !isBusy && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit material transfer?</DialogTitle>
            <DialogDescription>
              {totalQty} units across {lines.length} items move from {source} to {target}. ERP
              submits the Stock Entry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isBusy} onClick={() => void submit()}>
              {busyKey === "submit" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Sending...
                </>
              ) : (
                "Send to ERP"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MaterialTransferHistory scope="all" title="History" />
    </div>
  );
}
