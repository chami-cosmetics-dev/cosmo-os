export type CashSummaryGroup = {
  companyLocationId: string;
  companyLocationName: string;
  cashAmount: string;
  orderCount: number;
};

export type CashSummary = {
  totalExpectedCash: string;
  totalCollectedCash: string;
  groups: CashSummaryGroup[];
};
