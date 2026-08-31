"use client";

import { cn } from "@/lib/utils";

export type OrderCancelKindChoice = "customer_cancel" | "replacement";

const OPTIONS: Array<{
  value: OrderCancelKindChoice;
  title: string;
  hint: string;
}> = [
  {
    value: "customer_cancel",
    title: "Cancel",
    hint: "Customer gets cancellation SMS from ERP",
  },
  {
    value: "replacement",
    title: "Replacement",
    hint: "No SMS — new order will replace this one",
  },
];

export function OrderCancelKindSelect({
  value,
  onChange,
  disabled,
}: {
  value: OrderCancelKindChoice | "";
  onChange: (kind: OrderCancelKindChoice) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">
        Cancel type <span className="text-destructive">*</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50",
                disabled && "opacity-50",
              )}
            >
              <span className="block font-medium">{option.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
