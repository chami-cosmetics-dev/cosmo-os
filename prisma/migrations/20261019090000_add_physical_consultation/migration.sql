-- Consultation Insights: physical consultation log (one row per invoice).
CREATE TABLE IF NOT EXISTS "PhysicalConsultation" (
  "id"                TEXT         NOT NULL,
  "companyId"         TEXT         NOT NULL,
  "entryId"           TEXT         NOT NULL,
  "consultationDate"  DATE         NOT NULL,
  "contactNumber"     TEXT         NOT NULL,
  "invoiceNumber"     TEXT         NOT NULL,
  "customerName"      TEXT         NOT NULL,
  "merchantKind"      TEXT         NOT NULL,
  "merchantUserId"    TEXT,
  "companyLocationId" TEXT,
  "merchantName"      TEXT         NOT NULL,
  "physicalReview"    TEXT,
  "createdByUserId"   TEXT,
  "updatedByUserId"   TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicalConsultation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhysicalConsultation_companyId_consultationDate_idx"
  ON "PhysicalConsultation"("companyId", "consultationDate");

CREATE INDEX IF NOT EXISTS "PhysicalConsultation_companyId_invoiceNumber_idx"
  ON "PhysicalConsultation"("companyId", "invoiceNumber");

CREATE INDEX IF NOT EXISTS "PhysicalConsultation_entryId_idx"
  ON "PhysicalConsultation"("entryId");
