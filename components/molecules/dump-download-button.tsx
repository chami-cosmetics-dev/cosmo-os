"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  DUMP_TOTAL_HEADER,
  createCsvRowCounter,
  dumpProgressPercent,
  parseContentDispositionFilename,
  parseDumpTotalHeader,
} from "@/lib/reports/dump-download";
import { cn } from "@/lib/utils";

type DumpDownloadButtonProps = {
  href: string;
  label: string;
  className?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function DumpDownloadButton({
  href,
  label,
  className,
  disabled,
  onBusyChange,
}: DumpDownloadButtonProps) {
  const toastId = useId();
  const [percent, setPercent] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const busy = percent !== null;

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleClick() {
    if (busy) return;
    setPercent(0);
    onBusyChange?.(true);
    notify.loading(`Preparing ${label}…`, toastId);
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) {
        const text = await res.text();
        let message = `Download failed (${res.status})`;
        try {
          const json = JSON.parse(text) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          if (text.trim()) message = text.trim().slice(0, 200);
        }
        throw new Error(message);
      }

      const total = parseDumpTotalHeader(res.headers.get(DUMP_TOTAL_HEADER));
      const contentLength = Number(res.headers.get("Content-Length"));
      const fileName =
        parseContentDispositionFilename(res.headers.get("Content-Disposition")) ?? "dump.csv";
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Download stream unavailable");

      const chunks: BlobPart[] = [];
      const decoder = new TextDecoder();
      const counter = createCsvRowCounter();
      let received = 0;
      let lastNotified = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.byteLength;
        let nextPercent = 0;
        if (total > 0) {
          counter.consume(decoder.decode(value, { stream: true }));
          nextPercent = dumpProgressPercent(counter.dataRows(), total);
        } else if (Number.isFinite(contentLength) && contentLength > 0) {
          nextPercent = Math.min(99, Math.round((received / contentLength) * 100));
        }
        setPercent(nextPercent);
        if (nextPercent > 0 && nextPercent !== lastNotified) {
          lastNotified = nextPercent;
          notify.loading(`Downloading ${label} — ${nextPercent}%`, toastId);
        }
      }

      setPercent(100);
      triggerBlobDownload(new Blob(chunks, { type: "text/csv;charset=utf-8" }), fileName);
      notify.success(`${label} downloaded.`, toastId);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Download failed.", toastId);
    } finally {
      setPercent(null);
      onBusyChange?.(false);
    }
  }

  const statusLabel = busy
    ? percent && percent > 0
      ? `Downloading ${percent}%`
      : "Preparing..."
    : label;

  return (
    <>
      <div className="flex min-w-[10rem] flex-col gap-1.5">
        <Button
          type="button"
          disabled={disabled && !busy}
          onClick={() => void handleClick()}
          aria-busy={busy}
          className={cn("text-white", busy && "disabled:opacity-100", className)}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" />}
          {statusLabel}
        </Button>
        {busy ? (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? 0}
            aria-label={`${label} download`}
          >
            {percent && percent > 0 ? (
              <div
                className="h-full rounded-full bg-sky-500 transition-[width] duration-150"
                style={{ width: `${percent}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
            )}
          </div>
        ) : null}
      </div>
      {mounted && busy
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-sky-500" aria-hidden />
                  <p className="font-medium text-foreground">
                    {percent && percent > 0 ? `Downloading ${label}` : `Preparing ${label}`}
                  </p>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-sky-600">
                    {percent && percent > 0 ? `${percent}%` : "…"}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  {percent && percent > 0 ? (
                    <div
                      className="h-full rounded-full bg-sky-500 transition-[width] duration-150"
                      style={{ width: `${percent}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
