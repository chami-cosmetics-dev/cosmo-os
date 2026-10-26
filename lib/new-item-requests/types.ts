export const NEW_ITEM_REQUEST_STATUSES = ["open", "already_have", "closed"] as const;

export type NewItemRequestStatusValue = (typeof NEW_ITEM_REQUEST_STATUSES)[number];

export type NewItemRequestVoteView = {
  userName: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  createdAt: string;
};

export type NewItemRequestView = {
  id: string;
  brandName: string;
  brandNameNormalized: string;
  brandIsExisting: boolean;
  priority: string | null;
  productName: string;
  description: string;
  storeUrl: string | null;
  imageUrl: string | null;
  customerName: string | null;
  customerPhone: string | null;
  voteCount: number;
  voterNames: string[];
  votes: NewItemRequestVoteView[];
  hasVoted: boolean;
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
  voteCount: number;
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

export function formatVoteCount(row: { voteCount: number; voterNames?: string[] }) {
  const count = `${row.voteCount} vote${row.voteCount === 1 ? "" : "s"}`;
  const names = (row.voterNames ?? []).filter(Boolean);
  return names.length > 0 ? `${count} · ${names.join(", ")}` : count;
}
