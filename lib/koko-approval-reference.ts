import { isApprovalSplitRequestNote } from "@/lib/approval-payment-split";
import { parsePaymentMethodChangeTarget } from "@/lib/payment-method-label";

type KokoApprovalInput = {
  type: string;
  requestNote?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
};

export function normalizeKokoReference(reference: string): string {
  return reference.trim().toUpperCase();
}

export function requiresKokoApprovalReference(input: KokoApprovalInput): boolean {
  if (input.type === "payment_method_change_approval") {
    const target = parsePaymentMethodChangeTarget(input.requestNote);
    // The approval route treats an unparseable legacy method-change note as KOKO.
    return target === null || target === "koko";
  }

  if (input.type !== "order_payment_approval") return false;

  if (isApprovalSplitRequestNote(input.requestNote)) return true;

  if (input.paymentGatewayPrimary) {
    return input.paymentGatewayPrimary.trim().toLowerCase().includes("koko");
  }

  const hasKokoGateway = (input.paymentGatewayNames ?? []).some((gateway) =>
    gateway.trim().toLowerCase().includes("koko"),
  );
  if (hasKokoGateway) return true;

  return input.requestNote?.trim().toLowerCase().startsWith("koko") ?? false;
}
