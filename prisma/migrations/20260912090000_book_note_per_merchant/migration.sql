-- Book notes become per-merchant.
--
-- Until now a shop had exactly one book note per day, shared by everyone who
-- worked that shop: the second merchant to open it saw (and could overwrite)
-- the first merchant's sheet. Widening the unique key with the submitter gives
-- each merchant their own sheet for the same shop and date.
--
-- This only relaxes the constraint, so every existing row stays valid and
-- keeps its current owner.

DROP INDEX "BookNoteDay_companyLocationId_postingDate_key";

CREATE UNIQUE INDEX "BookNoteDay_companyLocationId_postingDate_createdByUserId_key"
  ON "BookNoteDay"("companyLocationId", "postingDate", "createdByUserId");

-- Lookups by shop + date (finance review, ERP verify) no longer have the old
-- unique index to lean on.
CREATE INDEX "BookNoteDay_companyLocationId_postingDate_idx"
  ON "BookNoteDay"("companyLocationId", "postingDate");
