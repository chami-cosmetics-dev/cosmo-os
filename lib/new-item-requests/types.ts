export const NEW_ITEM_REQUEST_STATUSES = ["open", "already_have", "closed"] as const;

export type NewItemRequestStatusValue = (typeof NEW_ITEM_REQUEST_STATUSES)[number];

export type NewItemRequestView = {
  id: string;
  brandName: string;
  brandNameNormalized: string;
  brandIsExisting: boolean;
  priority: string | null;
  description: string;
  storeUrl: string | null;
  imageUrl: string | null;
  status: NewItemRequestStatusValue;
  createdAt: string;
  createdByName: string | null;
  statusChangedAt: string | null;
  statusChangedByName: string | null;
};

export type NewItemRequestBrandGroup = {
  brandName: string;
  brandNameNormalized: string;
  isExisting: boolean;
  isNew: boolean;
  priority: string | null;
  requestCount: number;
};

export type NewItemRequestBrandHit = {
  name: string;
  priority: string | null;
};

export type NewItemRequestListFilters = {
  status: NewItemRequestStatusValue;
  brand?: string;
  createdFrom?: string;
  createdTo?: string;
};
