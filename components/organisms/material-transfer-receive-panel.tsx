"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { MaterialTransferHistory } from "@/components/organisms/material-transfer-history";
import { receiptVariance } from "@/lib/material-transfer/receive";
import { notify } from "@/lib/notify";
import { playScanErrorSound, unlockScanSound } from "@/lib/store-stock-count/scan-sound";

type IncomingRow = {
  id: string;
  erpName: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  createdAt: string;
  createdByName: string | null;
  sentQty: number;
  lineCount: number;
};

type ReceiptLine = {
  id: string;
  itemCode: string;
  itemName: string;
  barcode: string;
  sentQty: number;
  receivedQty: number;
};

type Receipt = {
  id: string;
  erpName: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  status: "sent" | "received";
  createdByName: string | null;
  mismatchCount: number;
  shortUnits: number;
  overUnits: number;
  lines: ReceiptLine[];
};

export function MaterialTransferReceivePanel() {
  const [rows, setRows] = useState<IncomingRow[]>([]);
  const [unassigned, setUnassigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [scan, setScan] = useState("");
  const [busyKey, setBusyKey] = useState<"load" | "scan" | "qty" | "mark" | null>("load");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [historyKey, setHistoryKey] = useState(0);
  const scanRef = useRef<HTMLInputElement>(null);
  const scanValueRef = useRef("");
  const qtyDraftRef = useRef(qtyDraft);
  const countPromise = useRef<Promise<void>>(Promise.resolve());
  qtyDraftRef.current = qtyDraft;
  const isBusy = busyKey !== null;

  const loadIncoming = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/store/material-transfer/history?scope=shop&status=sent");
      const json = (await res.json()) as {
        transfers?: IncomingRow[];
        shopUnassigned?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not load transfers");
      setRows(json.transfers ?? []);
      setUnassigned(Boolean(json.shopUnassigned));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load transfers");
    } finally {
      setLoading(false);
      setBusyKey(null);
    }
  }, []);

  useEffect(() => {
    void loadIncoming();
  }, [loadIncoming]);

  async function openReceipt(id: string) {
    setBusyKey("load");
    try {
      const res = await fetch(`/api/admin/store/material-transfer/${id}`);
      const json = (await res.json()) as { transfer?: Receipt; error?: string };
      if (!res.ok || !json.transfer) throw new Error(json.error || "Could not open the transfer");
      setReceipt(json.transfer);
      setQtyDraft({});
      setScan("");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not open the transfer");
    } finally {
      setBusyKey(null);
    }
  }

  function shownQty(line: ReceiptLine) {
    return qtyDraft[line.id] ?? String(line.receivedQty);
  }

  function countedLines(current: Receipt) {
    return current.lines.map((line) => {
      const raw = qtyDraft[line.id];
      const receivedQty = raw != null && raw !== "" ? Number(raw) : line.receivedQty;
      return { sentQty: line.sentQty, receivedQty };
    });
  }

  function postCount(
    body: { code?: string; itemCode?: string; qty?: number },
    key: "scan" | "qty" | "mark",
    options?: { keepBusy?: boolean },
  ) {
    const run = (async () => {
      if (!receipt) return false;
      if (!options?.keepBusy) setBusyKey(key);
      try {
        const res = await fetch(`/api/admin/store/material-transfer/${receipt.id}/count`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { transfer?: Receipt; error?: string };
        if (!res.ok || !json.transfer) throw new Error(json.error || "Could not update the count");
        setReceipt(json.transfer);
        if (body.itemCode) {
          const saved = json.transfer.lines.find((line) => line.itemCode === body.itemCode);
          setQtyDraft((current) => {
            if (!saved || current[saved.id] == null) return current;
            if (current[saved.id] !== String(body.qty)) return current;
            const next = { ...current };
            delete next[saved.id];
            return next;
          });
        }
        if (key === "scan") setScan("");
        return true;
      } catch (error) {
        if (key === "scan") playScanErrorSound();
        notify.error(error instanceof Error ? error.message : "Could not update the count");
        if (key === "scan") setScan("");
        return false;
      } finally {
        if (!options?.keepBusy) {
          setBusyKey(null);
          if (key === "scan") scanRef.current?.focus();
        }
      }
    })();
    countPromise.current = run.then(() => undefined);
    return run;
  }

  function commitQty(line: ReceiptLine) {
    const raw = qtyDraftRef.current[line.id];
    if (raw == null) return;
    if (raw === "" || Number(raw) === line.receivedQty) {
      setQtyDraft((current) => {
        if (current[line.id] == null) return current;
        const next = { ...current };
        delete next[line.id];
        return next;
      });
      return;
    }
    void postCount({ itemCode: line.itemCode, qty: Number(raw) }, "qty");
  }

  async function markReceived() {
    if (!receipt) return;
    await countPromise.current;
    setBusyKey("mark");
    try {
      const pending = receipt.lines.filter((line) => {
        const raw = qtyDraft[line.id];
        return raw != null && raw !== "" && Number(raw) !== line.receivedQty;
      });
      for (const line of pending) {
        const saved = await postCount(
          { itemCode: line.itemCode, qty: Number(qtyDraft[line.id]) },
          "mark",
          { keepBusy: true },
        );
        if (!saved) {
          setBusyKey(null);
          return;
        }
      }
      const res = await fetch(`/api/admin/store/material-transfer/${receipt.id}/receive`, {
        method: "POST",
      });
      const json = (await res.json()) as { transfer?: Receipt; error?: string };
      if (!res.ok || !json.transfer) throw new Error(json.error || "Could not mark received");
      notify.success(`${json.transfer.erpName} marked received`);
      setReceipt(null);
      setQtyDraft({});
      setConfirmOpen(false);
      setHistoryKey((value) => value + 1);
      await loadIncoming();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not mark received");
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Receive transfer</h1>
        <p className="text-muted-foreground text-sm">
          Count what arrived. A barcode scan adds 1 to received qty. You can also type the qty.
          Mark all items received when the count is done. Stores see that status.
        </p>
      </div>

      {unassigned ? (
        <p className="text-sm text-red-600">
          Assign an outlet on the staff profile to see this shop's transfers.
        </p>
      ) : null}

      {receipt ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{receipt.erpName}</h2>
              <p className="text-muted-foreground text-sm">
                {receipt.sourceWarehouse} → {receipt.targetWarehouse}
                {receipt.createdByName ? ` · sent by ${receipt.createdByName}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => {
                setReceipt(null);
                setQtyDraft({});
              }}
            >
              Back to list
            </Button>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const code = (scanRef.current?.value || scanValueRef.current || scan).trim();
              if (!code || isBusy) return;
              scanValueRef.current = "";
              setScan("");
              void postCount({ code }, "scan");
            }}
          >
            <Input
              ref={scanRef}
              value={scan}
              disabled={isBusy}
              placeholder="Scan barcode or type SKU"
              autoComplete="off"
              onFocus={unlockScanSound}
              onChange={(event) => {
                scanValueRef.current = event.target.value;
                setScan(event.target.value);
              }}
            />
            <Button type="submit" disabled={isBusy || !scan.trim()}>
              {busyKey === "scan" ? (
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
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Sent</th>
                  <th className="px-3 py-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{line.itemCode}</td>
                    <td className="px-3 py-2">{line.itemName}</td>
                    <td className="px-3 py-2">{line.sentQty}</td>
                    <td className="px-3 py-2">
                      <Input
                        className="w-24"
                        inputMode="numeric"
                        value={shownQty(line)}
                        disabled={isBusy}
                        aria-label={`Received qty for ${line.itemCode}`}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "");
                          setQtyDraft((current) => ({ ...current, [line.id]: digits }));
                        }}
                        onBlur={() => commitQty(line)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          event.currentTarget.blur();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button type="button" disabled={isBusy} onClick={() => setConfirmOpen(true)}>
              Mark all items received
            </Button>
          </div>

          <Dialog open={confirmOpen} onOpenChange={(open) => !isBusy && setConfirmOpen(open)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mark all items received?</DialogTitle>
                <DialogDescription>
                  {receiptVariance(countedLines(receipt)).mismatchCount === 0
                    ? "Received qty matches the sent qty on every line. Change a qty below if the count is wrong. Stores will see this transfer as received."
                    : `Received qty differs on ${receiptVariance(countedLines(receipt)).mismatchCount} lines. Change a qty below if the count is wrong. Stores will see the counted qty.`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {receipt.lines.map((line) => (
                  <label key={line.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">{line.itemCode}</span>
                      <span className="text-muted-foreground"> · sent {line.sentQty}</span>
                    </span>
                    <Input
                      className="w-24"
                      inputMode="numeric"
                      value={shownQty(line)}
                      disabled={isBusy}
                      aria-label={`Received qty for ${line.itemCode}`}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        setQtyDraft((current) => ({ ...current, [line.id]: digits }));
                      }}
                      onBlur={() => commitQty(line)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.currentTarget.blur();
                      }}
                    />
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={isBusy} onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={isBusy} onClick={() => void markReceived()}>
                  {busyKey === "mark" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Saving...
                    </>
                  ) : (
                    "Mark all items received"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Waiting for your shop</h2>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void loadIncoming()}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Loading...
                </>
              ) : (
                "Refresh"
              )}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Entry</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">To</th>
                  <th className="px-3 py-2 font-medium">Sent qty</th>
                  <th className="px-3 py-2 font-medium">Sent by</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td className="text-muted-foreground px-3 py-6" colSpan={5}>
                      Nothing waiting.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="font-medium underline"
                          disabled={isBusy}
                          onClick={() => void openReceipt(row.id)}
                        >
                          {row.erpName}
                        </button>
                      </td>
                      <td className="px-3 py-2">{row.sourceWarehouse}</td>
                      <td className="px-3 py-2">{row.targetWarehouse}</td>
                      <td className="px-3 py-2">{row.sentQty}</td>
                      <td className="px-3 py-2">{row.createdByName || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <MaterialTransferHistory key={historyKey} scope="shop" title="History" />
    </div>
  );
}
