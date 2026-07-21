export const FOLLOW_UP_STATUSES = ["pending", "follow_up", "closed"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const CUSTOMER_RESPONSES = [
  "no_more_interest",
  "purchased_elsewhere",
  "changed_my_mind",
  "recovered_sale",
  "no_response",
] as const;
export type CustomerResponse = (typeof CUSTOMER_RESPONSES)[number];

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending",
  follow_up: "Follow up",
  closed: "Closed",
};

export const CUSTOMER_RESPONSE_LABELS: Record<CustomerResponse, string> = {
  no_more_interest: "No more interest",
  purchased_elsewhere: "Purchased elsewhere",
  changed_my_mind: "Changed my mind",
  recovered_sale: "Recovered sale",
  no_response: "No response",
};

