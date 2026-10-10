import type { VatStatusSlotId } from "@/lib/vat-status/types";

export function erpTaxStatusColumn(slot: VatStatusSlotId): "erp1TaxStatus" | "erp2TaxStatus" {
  return slot === "erp1" ? "erp1TaxStatus" : "erp2TaxStatus";
}

export function webhookItemCode(payload: Record<string, unknown>): string | null {
  const code = payload.item_code ?? payload.name;
  if (code == null) return null;
  const text = String(code).trim();
  return text || null;
}

export function slotForInstance(
  instanceId: string,
  slots: { erp1: { id: string } | null; erp2: { id: string } | null },
): VatStatusSlotId | null {
  if (slots.erp1?.id === instanceId) return "erp1";
  if (slots.erp2?.id === instanceId) return "erp2";
  return null;
}
