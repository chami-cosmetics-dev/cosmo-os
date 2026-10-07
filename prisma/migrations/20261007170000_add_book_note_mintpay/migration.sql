-- MintPay amount and column-mode Order ID for book-note rows.
ALTER TABLE "BookNoteRow" ADD COLUMN "mintpay" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BookNoteRow" ADD COLUMN "mintpayReference" TEXT;
