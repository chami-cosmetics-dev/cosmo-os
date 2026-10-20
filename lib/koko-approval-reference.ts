import {
  approvalSplitNoteIncludesKoko,
  isApprovalSplitRequestNote,
} from "@/lib/approval-payment-split";
import { isKokoGateway, isMintpayGateway } from "@/lib/payment-gateway-match";
import { parsePaymentMethodChangeTarget } from "@/lib/payment-method-label";

type KokoApprovalInput = {
  type: string;
  requestNote?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
};

/** Finance reference captured the same way as KOKO. MintPay skips link-generated time. */
export type FinancePaymentReferenceKind = "koko" | "mintpay";

export function normalizeKokoReference(reference: string): string {
  return reference.trim().toUpperCase();
}

export function financePaymentReferenceKind(
  input: KokoApprovalInput,
): FinancePaymentReferenceKind | null {
  if (input.type === "payment_method_change_approval") {
    const target = parsePaymentMethodChangeTarget(input.requestNote);
    if (target === "mintpay") return "mintpay";
    if (target === "bank_transfer") return null;
    // Unparseable legacy method-change notes stay KOKO.
    return "koko";
  }

  if (input.type !== "order_payment_approval") return null;

  if (isApprovalSplitRequestNote(input.requestNote)) {
    return approvalSplitNoteIncludesKoko(input.requestNote) ? "koko" : null;
  }

  if (input.paymentGatewayPrimary) {
    if (isMintpayGateway(input.paymentGatewayPrimary)) return "mintpay";
    if (isKokoGateway(input.paymentGatewayPrimary)) return "koko";
    return null;
  }

  const names = input.paymentGatewayNames ?? [];
  if (names.some((gateway) => isMintpayGateway(gateway))) return "mintpay";
  if (names.some((gateway) => isKokoGateway(gateway))) return "koko";

  const note = input.requestNote?.trim().toLowerCase() ?? "";
  if (note.startsWith("koko")) return "koko";
  if (note.includes("mintpay") || note.includes("mint pay")) return "mintpay";
  return null;
}

export function requiresKokoApprovalReference(input: KokoApprovalInput): boolean {
  return financePaymentReferenceKind(input) === "koko";
}

export function requiresFinancePaymentReference(input: KokoApprovalInput): boolean {
  return financePaymentReferenceKind(input) != null;
}
