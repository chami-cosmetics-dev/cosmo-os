"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ErpPaymentModeOption = {
  key: string;
  label: string;
  mopName: string;
};

type ErpPaymentModeSelectProps = {
  value: string;
  onChange: (mopName: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function ErpPaymentModeSelect({
  value,
  onChange,
  disabled = false,
  className,
  placeholder = "Select ERP payment mode",
}: ErpPaymentModeSelectProps) {
  const [modes, setModes] = useState<ErpPaymentModeOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/erp-payment-modes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { modes?: ErpPaymentModeOption[] } | null) => {
        if (cancelled) return;
        const next = data?.modes ?? [];
        setModes(next);
        if (!value && next[0]?.mopName) {
          onChange(next[0].mopName);
        }
      })
      .catch(() => {
        if (!cancelled) setModes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load modes once
  }, []);

  if (loading) {
    return (
      <div className={`flex h-9 items-center gap-2 text-sm text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading payment modes…
      </div>
    );
  }

  if (modes.length === 0) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
        No ERP payment modes configured. Set them under Company → ERP instances.
      </p>
    );
  }

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? "h-9 w-full border-border/70 bg-background"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {modes.map((mode) => (
          <SelectItem key={mode.mopName} value={mode.mopName}>
            {mode.label} ({mode.mopName})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
