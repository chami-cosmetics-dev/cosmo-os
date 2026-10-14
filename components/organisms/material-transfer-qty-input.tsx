"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { commitSendQtyInput, replaceSendQtyKey } from "@/lib/material-transfer/lines";
import { notify } from "@/lib/notify";
import { playScanErrorSound } from "@/lib/store-stock-count/scan-sound";

export function MaterialTransferQtyInput({
  itemCode,
  qty,
  availableQty,
  disabled,
  onQty,
}: {
  itemCode: string;
  qty: number;
  availableQty: number | null;
  disabled?: boolean;
  onQty: (qty: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const replaceNext = useRef(false);

  return (
    <Input
      className="w-24"
      inputMode="numeric"
      value={draft ?? String(qty)}
      disabled={disabled}
      aria-label={`Qty for ${itemCode}`}
      onFocus={(event) => {
        replaceNext.current = true;
        event.currentTarget.select();
      }}
      onMouseUp={(event) => event.preventDefault()}
      onBlur={() => {
        replaceNext.current = false;
        setDraft(null);
      }}
      onChange={(event) => {
        const raw = replaceSendQtyKey(String(qty), event.target.value, replaceNext.current);
        replaceNext.current = false;
        const result = commitSendQtyInput(raw, availableQty);
        if (result.rejected) {
          playScanErrorSound();
          notify.error("Cannot send more than available");
          setDraft(null);
          if (result.qty != null && result.qty !== qty) onQty(result.qty);
          return;
        }
        if (result.qty == null) {
          setDraft(result.digits);
          return;
        }
        setDraft(String(result.qty));
        if (result.qty !== qty) onQty(result.qty);
      }}
    />
  );
}
