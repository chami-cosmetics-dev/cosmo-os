CREATE TABLE "ContactEmail" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactPhone" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactPhone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactEmail_contactId_email_key" ON "ContactEmail"("contactId", "email");
CREATE INDEX "ContactEmail_email_idx" ON "ContactEmail"("email");
CREATE INDEX "ContactEmail_contactId_idx" ON "ContactEmail"("contactId");

CREATE UNIQUE INDEX "ContactPhone_contactId_phoneNumber_key" ON "ContactPhone"("contactId", "phoneNumber");
CREATE INDEX "ContactPhone_phoneNumber_idx" ON "ContactPhone"("phoneNumber");
CREATE INDEX "ContactPhone_contactId_idx" ON "ContactPhone"("contactId");

ALTER TABLE "ContactEmail"
ADD CONSTRAINT "ContactEmail_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactPhone"
ADD CONSTRAINT "ContactPhone_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "ContactMaster"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
