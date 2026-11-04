/** Cosmo ERP COD mop (`custom_payment_type: Cash`) restored after a withdrawn bank-transfer rearrange. */
export const KEEP_ORIGINAL_COD_GATEWAY = "Cash";

export const KEEP_ORIGINAL_PAYMENT_APPROVAL_CANCEL_NOTE =
  "Cancelled — return rearrange keeps original payment; bank-transfer request withdrawn";

export function isUnpaidBankTransferGateway(order: {
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}) {
  const unpaid = (order.financialStatus ?? "").trim().toLowerCase() === "pending";
  if (!unpaid) return false;
  const gateways = [order.paymentGatewayPrimary, ...order.paymentGatewayNames].map((g) =>
    (g ?? "").trim().toLowerCase(),
  );
  return gateways.some((g) => g.includes("bank"));
}

export function keepOriginalCodPaymentFields() {
  return {
    paymentGatewayPrimary: KEEP_ORIGINAL_COD_GATEWAY,
    paymentGatewayNames: [KEEP_ORIGINAL_COD_GATEWAY],
    financialStatus: "pending" as const,
  };
}
