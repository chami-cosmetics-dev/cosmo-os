import type { TenantId } from "@/src/tenants/config";

export type CashSummaryGroup = {
  companyLocationId: string;
  companyLocationName: string;
  cashAmount: string;
  orderCount: number;
};

export type CashSummaryOrder = {
  paymentId: string;
  orderId: string;
  orderLabel: string;
  companyLocationId: string;
  companyLocationName: string;
  expectedAmount: string;
  collectedAmount: string;
  collectionStatus: string;
  collectedAt: string | null;
};

export type CashSummary = {
  date?: string;
  totalExpectedCash: string;
  totalCollectedCash: string;
  groups: CashSummaryGroup[];
  orders?: CashSummaryOrder[];
};

export type CashHandoverRecord = {
  id: string;
  handoverDate: string;
  submittedAt: string;
  receivedAt?: string | null;
  status: string;
  totalExpectedCash: string;
  totalHandedOverCash: string;
  varianceAmount: string;
  notes?: string | null;
  tenant: TenantId;
  companyLabel: string;
};

export type CashHandoversResponse = {
  handovers: Array<Omit<CashHandoverRecord, "tenant" | "companyLabel">>;
};
