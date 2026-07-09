"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

export function OgfResendButton({ batchCode }: { batchCode: string }) {
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ogf-resend?batch=${encodeURIComponent(batchCode)}`);
      const data = (await res.json()) as { ok?: boolean; orders?: number; message?: string };
      if (res.ok && data.ok) {
        notify.success(`Email resent — ${data.orders} order${(data.orders ?? 0) !== 1 ? "s" : ""} in batch ${batchCode}`);
      } else {
        notify.error(data.message ?? "Failed to resend email");
      }
    } catch {
      notify.error("Network error — could not resend email");
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
