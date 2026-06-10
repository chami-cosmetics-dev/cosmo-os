import type { TenantId } from "@/src/tenants/config";

export type DeliveryStatus = "assigned" | "accepted" | "arrived" | "completed" | "failed";
export type DeliveryKind = "normal" | "rearranged" | "exchange";
export type PaymentMethod = "cod" | "bank_transfer" | "card" | "already_paid";
export type OldItemCollectionStatus = "pending" | "collected" | "not_collected";

export type AddressLike = {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
};

export type DeliveryPayment = {
  expectedAmount?: string;
  collectedAmount: string;
  paymentMethod?: PaymentMethod;
  collectionStatus: string;
  referenceNote?: string | null;
  bankReference?: string | null;
  cardReference?: string | null;
  collectedAt?: string | null;
};

export type ApiMobileDelivery = {
  id: string;
  orderLabel: string;
  amount: string;
  currency?: string | null;
  deliveryStatus: DeliveryStatus | string;
  deliveryKind: DeliveryKind;
  oldOrderLabel?: string | null;
  requiresOldItemCollection?: boolean;
  exchangePaymentDifference?: string | null;
  customerName: string | null;
  customerPhone?: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  expectedPaymentMethod?: PaymentMethod | null;
  companyLocation?: { name: string } | null;
  payment: DeliveryPayment | null;
  completedAt?: string | null;
};

export type TenantMobileDelivery = ApiMobileDelivery & {
  tenant: TenantId;
  companyLabel: string;
};

export type DeliveryLineItem = {
  id: string;
  productTitle: string;
  quantity: number;
  price: string;
};

export type ApiMobileDeliveryDetail = ApiMobileDelivery & {
  customerPhone: string | null;
  replacementOrderLabel?: string | null;
  requiresOldItemCollection: boolean;
  oldItemCollectionStatus: OldItemCollectionStatus;
  oldItemCollectionRemark?: string | null;
  expectedPaymentMethod?: PaymentMethod | null;
  lineItems: DeliveryLineItem[];
};

export type MobileDeliveryDetail = ApiMobileDeliveryDetail;

export type MobileDeliveriesResponse = {
  deliveries: ApiMobileDelivery[];
};

export type MobileDeliveryDetailResponse = {
  delivery: ApiMobileDeliveryDetail;
};
