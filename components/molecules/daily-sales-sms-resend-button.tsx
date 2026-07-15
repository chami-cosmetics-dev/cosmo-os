"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

export function DailySalesSmsResendButton({ reportDate }: { reportDate: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleResend() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/company/daily-sales-sms/resend?reportDate=${encodeURIComponent(reportDate)}`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        recipientCount?: number;
        message?: string;
        status?: string;
      };
      if (res.ok && data.ok) {
        notify.success(
          `Daily sales SMS resent for ${reportDate} (${data.recipientCount ?? 0} recipient${(data.recipientCount ?? 0) !== 1 ? "s" : ""})`,
        );
        router.refresh();
      } else {
        notify.error(data.message ?? `Resend failed (${data.status ?? res.status})`);
        router.refresh();
      }
    } catch {
      notify.error("Network error — could not resend SMS");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={() => void handleResend()}
      className="h-7 gap-1.5 border-border/70 bg-background/85 text-xs"
    >
      <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
      Resend
    </Button>
  );
}
