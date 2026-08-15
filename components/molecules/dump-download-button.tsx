"use client";

import { useState } from "react";
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
  const [percent, setPercent] = useState<number | null>(null);
  const busy = percent !== null;

  async function handleClick() {
    if (busy) return;
    setPercent(0);
    onBusyChange?.(true);
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) {
          counter.consume(decoder.decode(value, { stream: true }));
          setPercent(dumpProgressPercent(counter.dataRows(), total));
        } else if (Number.isFinite(contentLength) && contentLength > 0) {
          setPercent(Math.min(99, Math.round((received / contentLength) * 100)));
        }
      }

      setPercent(100);
      triggerBlobDownload(new Blob(chunks, { type: "text/csv;charset=utf-8" }), fileName);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setPercent(null);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="flex min-w-[9.5rem] flex-col gap-1">
      <Button
        type="button"
        disabled={disabled || busy}
        onClick={() => void handleClick()}
        className={cn("text-white", className)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" />}
        {busy ? (percent && percent > 0 ? `${percent}%` : "Preparing...") : label}
      </Button>
      {busy ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/20"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? 0}
          aria-label={`${label} download`}
        >
          <div
            className="h-full rounded-full bg-sky-500 transition-[width] duration-150"
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
