-- ERPNext integration fields on CompanyLocation

ALTER TABLE "CompanyLocation" ADD COLUMN "erpnextCompany" TEXT;
ALTER TABLE "CompanyLocation" ADD COLUMN "erpnextWarehouse" TEXT;
