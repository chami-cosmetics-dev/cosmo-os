-- Card payment receipt reference (last 4 digits) per book-note row.
ALTER TABLE "BookNoteRow" ADD COLUMN "cardReceiptRefLast4" TEXT;
