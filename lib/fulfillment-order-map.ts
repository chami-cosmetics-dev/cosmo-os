import type { FulfillmentOrder } from "@/components/organisms/fulfillment-order-selector";

type ApiOrder = {
  id: string;
  orderNumber?: string | null;
  name?: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId?: string | null;
  sourceName?: string;
  totalPrice?: string | number;
  currency?: string | null;
  paymentGatewayNames?: string[];
  paymentGatewayPrimary?: string | null;
  createdAt?: string;
  companyLocation?: FulfillmentOrder["companyLocation"];
  assignedMerchant?: FulfillmentOrder["assignedMerchant"];
  discountCodes?: unknown;
  customerEmail?: string | null;
  customerPhone?: string | null;
  printCount?: number;
  packageOnHoldAt?: string | null;
  packageHoldReason?: FulfillmentOrder["packageHoldReason"];
  sampleFreeIssueSendLaterDate?: string | null;
  fulfillmentStage?: string | null;
};

export function mapApiOrderToFulfillmentOrder(data: ApiOrder): FulfillmentOrder {
  return {
    id: data.id,
    orderNumber: data.orderNumber ?? null,
    name: data.name ?? null,
    shopifyOrderId: data.shopifyOrderId ?? null,
    erpnextInvoiceId: data.erpnextInvoiceId ?? null,
    sourceName: data.sourceName ?? "",
    totalPrice: String(data.totalPrice ?? "0"),
    currency: data.currency ?? null,
    paymentGatewayNames: data.paymentGatewayNames ?? [],
    paymentGatewayPrimary: data.paymentGatewayPrimary ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    companyLocation: data.companyLocation ?? null,
    assignedMerchant: data.assignedMerchant ?? null,
    discountCodes: data.discountCodes,
    customerEmail: data.customerEmail ?? null,
    customerPhone: data.customerPhone ?? null,
    printCount: data.printCount,
    packageOnHoldAt: data.packageOnHoldAt ?? undefined,
    packageHoldReason: data.packageHoldReason ?? undefined,
    sampleFreeIssueSendLaterDate: data.sampleFreeIssueSendLaterDate ?? undefined,
    fulfillmentStage: data.fulfillmentStage ?? undefined,
  };
}
