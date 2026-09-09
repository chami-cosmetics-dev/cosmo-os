"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

function todayColombo(): string {
  return formatAppIsoDate(new Date());
}

function currentMonthColombo(): string {
  return todayColombo().slice(0, 7);
}

export function VaultOsfGeneratePanel({ canManage = false }: { canManage?: boolean }) {
  const [asOfDate, setAsOfDate] = useState(todayColombo);
  const [historyMonth, setHistoryMonth] = useState(currentMonthColombo);
  const [busyKey, setBusyKey] = useState<"generate" | "dl" | "up" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isBusy = busyKey !== null;

  async function generate() {
    setBusyKey("generate");
    setErrorDetail(null);
    try {
      const res = await fetch("/api/admin/osf/vault/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorDetail(typeof json.detail === "string" ? json.detail : null);
        if (json.code === "ERP_UNAVAILABLE") {
          throw new Error(json.detail || "ERP unreachable — missing figures were not written as zero.");
        }
        if (json.code === "VAULT_OSF_NOT_CONFIGURED") {
          throw new Error(json.detail || json.error || "Vault OSF is not configured.");
        }
        throw new Error(json.error ?? `Generate failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OSF-vault-${asOfDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("Vault OSF downloaded");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function downloadHistory() {
    setBusyKey("dl");
    try {
      const res = await fetch(
        `/api/admin/osf/vault/sales-history?month=${encodeURIComponent(historyMonth)}`,
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OSF-sales-history-${historyMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("Sales history template downloaded");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setBusyKey("up");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("month", historyMonth);
      const res = await fetch("/api/admin/osf/vault/sales-history", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
      const updated = Number(json.updatedCells ?? 0);
      const errors = Array.isArray(json.errors) ? json.errors.length : 0;
      notify.success(
        errors > 0
          ? `${updated} cells updated for ${historyMonth}, ${errors} issue(s)`
          : `${updated} cells updated for ${historyMonth}`,
      );
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyKey(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Generate OSF</h3>
        <p className="text-sm text-muted-foreground">
          SV / ORI / AE stock and sales from April through the as-of date. Prices from ERP1.
          Internal transfers are excluded.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          As-of date
          <Input
            type="date"
            className="mt-1"
            value={asOfDate}
            disabled={isBusy}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </label>
      </div>
      <Button type="button" onClick={() => void generate()} disabled={isBusy || !asOfDate}>
        {busyKey === "generate" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Generating...
          </>
        ) : (
          <>
            <Download className="size-4" aria-hidden />
            Generate OSF
          </>
        )}
      </Button>
      {errorDetail ? (
        <p className="whitespace-pre-wrap text-xs text-destructive/90">{errorDetail}</p>
      ) : null}

      {canManage ? (
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-medium">April / May sales history</h3>
          <p className="text-sm text-muted-foreground">
            Months with no ERP invoices stay blank until you upload counts.
          </p>
          <label className="text-xs font-medium">
            Month
            <Input
              type="month"
              className="mt-1 max-w-xs"
              value={historyMonth}
              disabled={isBusy}
              onChange={(e) => setHistoryMonth(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => void downloadHistory()}
            >
              {busyKey === "dl" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="size-4" aria-hidden />
                  Download sales history template
                </>
              )}
            </Button>
            <Button type="button" size="sm" disabled={isBusy} onClick={() => inputRef.current?.click()}>
              {busyKey === "up" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="size-4" aria-hidden />
                  Upload sales history
                </>
              )}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
