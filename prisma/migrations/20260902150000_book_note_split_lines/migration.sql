-- Split payment legs per book-note row (ERP split_lines payload).
ALTER TABLE "BookNoteRow" ADD COLUMN "splitLines" JSONB;
