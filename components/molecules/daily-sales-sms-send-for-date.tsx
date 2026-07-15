"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function colomboYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function previousColomboReportDate(): string {
  const today = colomboYmd(new Date());
  const [y, m, day] = today.split("-").map(Number);
  // Noon UTC proxy for calendar arithmetic in Colombo-safe YMD
  const utcGuess = new Date(Date.UTC(y!, m! - 1, day!, 12, 0, 0));
  utcGuess.setUTCDate(utcGuess.getUTCDate() - 1);
  return colomboYmd(utcGuess);
}

function isValidReportDate(value: string): boolean {
  if (!REPORT_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m! - 1 &&
    dt.getUTCDate() === d
  );
}

export function DailySalesSmsSendForDate({
  defaultReportDate,
}: {
  defaultReportDate?: string;
}) {
  const router = useRouter();
  const [reportDate, setReportDate] = useState(
    defaultReportDate ?? previousColomboReportDate(),
  );
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const trimmed = reportDate.trim();
    if (!isValidReportDate(trimmed)) {
      notify.error("Enter a valid report date (YYYY-MM-DD)");
      return;
    }
    if (trimmed > colomboYmd(new Date())) {
      notify.error("Report date cannot be in the future (Asia/Colombo)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/company/daily-sales-sms/resend?reportDate=${encodeURIComponent(trimmed)}`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        recipientCount?: number;
        message?: string;
        status?: string;
      };
      if (res.ok && data.ok) {
        notify.success(
          `Daily sales SMS sent for ${trimmed} (${data.recipientCount ?? 0} recipient${(data.recipientCount ?? 0) !== 1 ? "s" : ""})`,
        );
        router.refresh();
      } else {
        notify.error(data.message ?? `Send failed (${data.status ?? res.status})`);
        router.refresh();
      }
    } catch {
      notify.error("Network error — could not send SMS");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label htmlFor="sales-sms-report-date" className="text-xs font-medium text-muted-foreground">
          Report date (YYYY-MM-DD)
        </label>
        <Input
          id="sales-sms-report-date"
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          disabled={loading}
          className="h-9 w-[11.5rem] rounded-lg border-border/80 bg-background/80"
        />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={loading}
        onClick={() => void handleSend()}
        className="h-9 gap-1.5"
      >
        <Send className="size-3.5" />
        {loading ? "Sending…" : "Send for date"}
      </Button>
    </div>
  );
}
