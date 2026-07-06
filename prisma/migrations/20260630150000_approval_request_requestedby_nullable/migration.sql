-- ApprovalRequest.requestedById was created as NOT NULL but the application
-- allows system-generated approvals (e.g. ERP webhook) with no requesting user.
-- This mismatch caused createOrGetOrderPaymentApproval to silently fail whenever
-- requestedById was null (ERP-native orders).
ALTER TABLE "ApprovalRequest" ALTER COLUMN "requestedById" DROP NOT NULL;
