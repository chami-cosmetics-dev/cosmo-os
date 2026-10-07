export const INVOICE_REVERT_CREDIT_NOTE_TEMPLATE = "invoice_revert";
export const INVOICE_REVERT_STAGE_ONLY_TEMPLATE = "invoice_revert_only";

export const INVOICE_REVERT_MODES = ["credit_note", "stage_only"] as const;
export type InvoiceRevertMode = (typeof INVOICE_REVERT_MODES)[number];

export function isInvoiceRevertStageOnly(templates: Array<string | null | undefined>) {
  const hasStageOnly = templates.includes(INVOICE_REVERT_STAGE_ONLY_TEMPLATE);
  const hasCreditNote = templates.includes(INVOICE_REVERT_CREDIT_NOTE_TEMPLATE);
  return hasStageOnly && !hasCreditNote;
}

/** Credit-note revert still follows store return → finance void. Stage-only does not. */
export function isFinanceCreditNoteRevert(input: {
  fulfillmentStage: string;
  revertedFromInvoiceCompleteAt: Date | string | null | undefined;
  returnTemplates: Array<string | null | undefined>;
}) {
  if (input.fulfillmentStage !== "delivery_complete" || !input.revertedFromInvoiceCompleteAt) {
    return false;
  }
  return !isInvoiceRevertStageOnly(input.returnTemplates);
}
