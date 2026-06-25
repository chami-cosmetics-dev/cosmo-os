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

/** Sentinel: PE uses each order's Vault payment method mapped to ERP. */
export const ERP_PAYMENT_MODE_ORDER_DEFAULT = "__order_payment_mode__";

type ErpPaymentModeSelectProps = {
  value: string;
  onChange: (mopName: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** When true, first option uses order payment mode (default for invoice complete). */
  allowOrderDefault?: boolean;
  /** When true, no selection means keep existing / use stored attempted mode (failed PE retry override). */
  allowEmpty?: boolean;
  emptyLabel?: string;
};

export function ErpPaymentModeSelect({
  value,
  onChange,
  disabled = false,
  className,
  placeholder = "Select ERP payment mode",
  allowOrderDefault = false,
  allowEmpty = false,
  emptyLabel = "Same as attempted",
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
        if (!allowOrderDefault && !allowEmpty && !value && next[0]?.mopName) {
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

  const emptySentinel = "__erp_mop_empty__";
  const selectValue = allowEmpty && !value
    ? emptySentinel
    : !value || value === ERP_PAYMENT_MODE_ORDER_DEFAULT
      ? allowOrderDefault
        ? ERP_PAYMENT_MODE_ORDER_DEFAULT
        : undefined
      : value;

  if (loading) {
    return (
      <div className={`flex h-9 items-center gap-2 text-sm text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading payment modes…
      </div>
    );
  }

  if (modes.length === 0 && !allowOrderDefault && !allowEmpty) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
        No ERP payment modes configured. Set them under Company → ERP instances.
      </p>
    );
  }

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => {
        if (next === emptySentinel) {
          onChange("");
          return;
        }
        onChange(next === ERP_PAYMENT_MODE_ORDER_DEFAULT ? ERP_PAYMENT_MODE_ORDER_DEFAULT : next);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? "h-9 w-full border-border/70 bg-background"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value={emptySentinel}>{emptyLabel}</SelectItem>
        )}
        {allowOrderDefault && (
          <SelectItem value={ERP_PAYMENT_MODE_ORDER_DEFAULT}>
            Order payment mode (default)
          </SelectItem>
        )}
        {modes.map((mode) => (
          <SelectItem key={mode.mopName} value={mode.mopName}>
            {mode.label} ({mode.mopName})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function resolveErpPaymentModeForApi(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ERP_PAYMENT_MODE_ORDER_DEFAULT) return undefined;
  return trimmed;
}
