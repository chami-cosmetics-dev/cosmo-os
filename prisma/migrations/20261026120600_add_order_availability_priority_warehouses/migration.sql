CREATE TABLE "OrderAvailabilityPriorityWarehouse" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "warehouse" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderAvailabilityPriorityWarehouse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAvailabilityPriorityWarehouse_companyId_priority_key"
  ON "OrderAvailabilityPriorityWarehouse"("companyId", "priority");
CREATE UNIQUE INDEX "OrderAvailabilityPriorityWarehouse_companyId_warehouse_key"
  ON "OrderAvailabilityPriorityWarehouse"("companyId", "warehouse");
CREATE INDEX "OrderAvailabilityPriorityWarehouse_companyId_idx"
  ON "OrderAvailabilityPriorityWarehouse"("companyId");

ALTER TABLE "OrderAvailabilityPriorityWarehouse"
  ADD CONSTRAINT "OrderAvailabilityPriorityWarehouse_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
