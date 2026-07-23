"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

export function OsfRopImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busyKey, setBusyKey] = useState<"download" | "upload" | null>(null);
  const isBusy = busyKey !== null;

  async function downloadTemplate() {
    setBusyKey("download");
    try {
      const res = await fetch("/api/admin/osf/rop-template");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      a.download = match?.[1] ?? "OSF-ROP-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      notify.success("ROP template downloaded");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setBusyKey("upload");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/osf/rop-import", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);

      const updated = Number(json.updatedCells ?? 0);
      const errors = Array.isArray(json.errors) ? json.errors.length : 0;
      if (errors > 0) {
        notify.success(
          `ROP import: ${updated} cell(s) updated, ${errors} issue(s) — check details in response if needed`,
        );
      } else {
        notify.success(`ROP import: ${updated} cell(s) updated`);
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyKey(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Import / update ROPs</h3>
        <p className="text-sm text-muted-foreground">
          Download a template with all SKUs (SKU, barcode, location and shop ROP columns),
          edit offline, then upload. Blank cells leave existing ROPs unchanged.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => void downloadTemplate()}
        >
          {busyKey === "download" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Downloading...
            </>
          ) : (
            <>
              <Download className="size-4" aria-hidden />
              Download ROP template
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isBusy}
          onClick={() => inputRef.current?.click()}
        >
          {busyKey === "upload" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="size-4" aria-hidden />
              Upload ROP file
            </>
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          disabled={isBusy}
          onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}
