/** ERP User shown as Payment Entry owner. Same source as material transfer. */
export function erpDocumentOwner(user: {
  erpnextUsername?: string | null;
  email?: string | null;
}): string {
  return user.erpnextUsername?.trim() || user.email?.trim() || "";
}

export const ERP_OWNER_MISSING_MESSAGE =
  "Your ERP username is not set. An admin must link it before invoices can be marked complete.";

export type DeliveryPaymentEntryFields = {
  payment_type: "Receive";
  company: string;
  posting_date: string;
  mode_of_payment: string;
  party_type: "Customer";
  party: string;
  paid_from: string;
  paid_to: string;
  reference_no: string;
  reference_date: string;
  paid_amount: number;
  received_amount: number;
  source_exchange_rate: number;
  target_exchange_rate: number;
  references: Array<{
    reference_doctype: "Sales Invoice";
    reference_name: string;
    allocated_amount: number;
  }>;
};

/** Body for `/api/resource/Payment Entry` (API user remains the owner). */
export function buildResourcePaymentEntryBody(fields: DeliveryPaymentEntryFields) {
  return {
    doctype: "Payment Entry" as const,
    ...fields,
    docstatus: 1 as const,
  };
}

/**
 * Body for ERP `cosmo_save_doc`. The script submits the Payment Entry, then
 * stamps owner, modified_by, and the activity log as this ERP user.
 */
export function buildOwnedPaymentEntryCall(input: {
  owner: string;
  fields: DeliveryPaymentEntryFields;
}) {
  return {
    owner: input.owner.trim(),
    action: "insert" as const,
    doc: {
      doctype: "Payment Entry" as const,
      ...input.fields,
      references: input.fields.references.map((row) => ({
        doctype: "Payment Entry Reference" as const,
        ...row,
      })),
    },
  };
}

/** `cosmo_save_doc` returns `{ message: { name } }`. */
export function paymentEntryNameFromSaveDoc(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as { name?: unknown; message?: unknown; data?: unknown };
  const message = body.message ?? body.data;
  if (message && typeof message === "object" && "name" in message) {
    return String((message as { name?: unknown }).name ?? "").trim();
  }
  if (typeof message === "string") return message.trim();
  return String(body.name ?? "").trim();
}

/**
 * True only when `cosmo_save_doc` failed before insert.
 * A later validation error may already have saved a draft, so it must not fall back.
 */
export function shouldFallbackPaymentEntryOwner(message: string): boolean {
  return (
    message.includes("ERP user is disabled or missing") ||
    message.includes("Failed to get method") ||
    message.includes("/api/method/cosmo_save_doc [404]")
  );
}
