-- Per-invoice special note for bank recon (ERP bank_recon_set_book_note_special_note).

ALTER TABLE "BookNoteRow" ADD COLUMN "specialNote" TEXT;
