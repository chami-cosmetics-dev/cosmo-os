-- Day-level receipt images for merchant book notes (pushed to ERP on Send).
CREATE TABLE "BookNoteReceipt" (
    "id" TEXT NOT NULL,
    "bookNoteDayId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookNoteReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookNoteReceipt_bookNoteDayId_sortOrder_idx" ON "BookNoteReceipt"("bookNoteDayId", "sortOrder");

ALTER TABLE "BookNoteReceipt" ADD CONSTRAINT "BookNoteReceipt_bookNoteDayId_fkey" FOREIGN KEY ("bookNoteDayId") REFERENCES "BookNoteDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
