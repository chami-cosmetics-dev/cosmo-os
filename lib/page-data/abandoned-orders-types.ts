import type { CustomerResponse, FollowUpStatus } from "@/lib/abandoned-orders-constants";

export type AbandonedOrdersFilters = {
  /** Inclusive bounds for abandonedAt. */
  from?: Date;
  to?: Date;
  followUpStatus?: FollowUpStatus[];
  customerResponse?: CustomerResponse[];
  search?: string;
  page: number;
  limit: number;
};

export type AbandonedOrdersListItem = {
  id: string;
  shopifyCheckoutId: string;
  abandonedAt: string;

  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;

  lineItemsSummary: string;
  totalPrice: string;
  currency: string;
  shopifyAdminStoreHandle: string;

  followUpStatus: FollowUpStatus;
  customerResponse: CustomerResponse | null;
  remark: string | null;

  lastFollowUpBy: { id: string; name: string | null; email: string | null } | null;
  lastFollowUpAt: string | null;

  shopifyRecoveredAt: string | null;
};

export type AbandonedOrdersPagination = {
  page: number;
  limit: number;
  total: number;
};

export type AbandonedOrdersSyncInfo = {
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  syncedJustNow: boolean;
};

export type AbandonedOrdersPageDataResponse = {
  items: AbandonedOrdersListItem[];
  pagination: AbandonedOrdersPagination;
  sync: AbandonedOrdersSyncInfo;
  canManage: boolean;
};

