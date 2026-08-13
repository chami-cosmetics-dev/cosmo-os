export const FOLLOW_UP_STATUSES = ["pending", "follow_up", "closed"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/** Values staff can pick when closing follow-up (plus recovered_sale from Shopify auto-close). */
export const CUSTOMER_RESPONSES = [
  "converted_to_order",
  "unable_to_contact",
  "internal_staff",
  "customer_doesnt_want_order",
  "already_placed_order",
  "placed_order_from_another_place",
  "sent_an_email",
  "recovered_sale",
] as const;
export type CustomerResponse = (typeof CUSTOMER_RESPONSES)[number];

/** Older stored values — still display correctly in lists/filters. */
export const LEGACY_CUSTOMER_RESPONSES = [
  "no_more_interest",
  "purchased_elsewhere",
  "changed_my_mind",
  "no_response",
] as const;
export type LegacyCustomerResponse = (typeof LEGACY_CUSTOMER_RESPONSES)[number];

/** Current + legacy values allowed in abandoned-orders list filters. */
export const FILTER_CUSTOMER_RESPONSES = [
  ...CUSTOMER_RESPONSES,
  ...LEGACY_CUSTOMER_RESPONSES,
] as const;
export type CustomerResponseFilterValue = (typeof FILTER_CUSTOMER_RESPONSES)[number];

const LEGACY_CUSTOMER_RESPONSE_LABELS: Record<LegacyCustomerResponse, string> = {
  no_more_interest: "No more interest",
  purchased_elsewhere: "Purchased elsewhere",
  changed_my_mind: "Changed my mind",
  no_response: "No response",
};

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending",
  follow_up: "Follow up",
  closed: "Closed",
};

export const CUSTOMER_RESPONSE_LABELS: Record<CustomerResponse, string> = {
  converted_to_order: "Converted to an order",
  unable_to_contact: "Unable to contact",
  internal_staff: "Internal staff",
  customer_doesnt_want_order: "Customer doesn't want the order",
  already_placed_order: "Already placed an order by another merchant",
  placed_order_from_another_place: "Customer placed an order from another place",
  sent_an_email: "Sent an email",
  recovered_sale: "Recovered sale",
};

/** Staff-facing responses only (filters + close form). recovered_sale stays system-only. */
export const MANUAL_CUSTOMER_RESPONSES = CUSTOMER_RESPONSES.filter(
  (r) => r !== "recovered_sale"
) as Exclude<CustomerResponse, "recovered_sale">[];

export function getCustomerResponseLabel(value: string | null | undefined): string {
  if (!value) return "—";
  if (value in CUSTOMER_RESPONSE_LABELS) {
    return CUSTOMER_RESPONSE_LABELS[value as CustomerResponse];
  }
  if ((LEGACY_CUSTOMER_RESPONSES as readonly string[]).includes(value)) {
    return LEGACY_CUSTOMER_RESPONSE_LABELS[value as LegacyCustomerResponse];
  }
  return value;
}

/** Table/CSV Response cell: prefer merchant remark; hide system-only recovered_sale. */
export function getAbandonedOrdersResponseDisplay(item: {
  remark?: string | null;
  customerResponse?: string | null;
}): string {
  const remark = item.remark?.trim();
  if (remark) return remark;
  if (!item.customerResponse || item.customerResponse === "recovered_sale") return "—";
  return getCustomerResponseLabel(item.customerResponse);
}

export const REMARK_TEMPLATES = [
  {
    id: "converted_to_order",
    label: "Converted to an order",
  },
  {
    id: "unable_to_contact",
    label: "Unable to contact",
  },
  {
    id: "internal_staff",
    label: "Internal staff",
  },
  {
    id: "customer_doesnt_want_order",
    label: "Customer doesn't want the order",
  },
  {
    id: "already_placed_order",
    label: "Already placed an order by another merchant",
  },
  {
    id: "placed_order_from_another_place",
    label: "Customer placed an order from another place",
  },
  {
    id: "sent_an_email",
    label: "Sent an email",
  },
  {
    id: "custom",
    label: "Custom",
  },
] as const;

export type RemarkTemplateId = (typeof REMARK_TEMPLATES)[number]["id"];

const REMARK_TEMPLATE_ALIASES: Record<string, RemarkTemplateId> = {
  "Already placed an order": "already_placed_order",
};

export function matchRemarkTemplateId(remark: string | null | undefined): RemarkTemplateId {
  const trimmed = remark?.trim() ?? "";
  if (!trimmed) return "custom";
  const hit = REMARK_TEMPLATES.find((t) => t.id !== "custom" && t.label === trimmed);
  if (hit) return hit.id;
  return REMARK_TEMPLATE_ALIASES[trimmed] ?? "custom";
}
