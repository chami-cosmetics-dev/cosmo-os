CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "orderId" TEXT,
    "orderReturnId" TEXT,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "requestNote" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApprovalRequest_companyId_status_createdAt_idx"
  ON "ApprovalRequest"("companyId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ApprovalRequest_companyId_type_status_createdAt_idx"
  ON "ApprovalRequest"("companyId", "type", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ApprovalRequest_orderId_idx"
  ON "ApprovalRequest"("orderId");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_orderReturnId_idx"
  ON "ApprovalRequest"("orderReturnId");

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx"
  ON "Notification"("userId", "readAt", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Notification_companyId_userId_createdAt_idx"
  ON "Notification"("companyId", "userId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_companyId_fkey') THEN
    ALTER TABLE "ApprovalRequest"
      ADD CONSTRAINT "ApprovalRequest_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_orderId_fkey') THEN
    ALTER TABLE "ApprovalRequest"
      ADD CONSTRAINT "ApprovalRequest_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_orderReturnId_fkey') THEN
    ALTER TABLE "ApprovalRequest"
      ADD CONSTRAINT "ApprovalRequest_orderReturnId_fkey"
      FOREIGN KEY ("orderReturnId") REFERENCES "OrderReturn"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_requestedById_fkey') THEN
    ALTER TABLE "ApprovalRequest"
      ADD CONSTRAINT "ApprovalRequest_requestedById_fkey"
      FOREIGN KEY ("requestedById") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_reviewedById_fkey') THEN
    ALTER TABLE "ApprovalRequest"
      ADD CONSTRAINT "ApprovalRequest_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_companyId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
