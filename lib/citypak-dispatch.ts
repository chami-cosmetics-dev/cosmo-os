import { isCitypakCourier } from "@/lib/courier";
import {
  CITYPAK_WAYBILL_SOURCE,
  citypakCodAmount,
  createCitypakOrder,
  getCitypakSender,
  matchCitypakAccount,
  normalizeCitypakPrefix,
} from "@/lib/citypak-api";
import { resolveFalconExportGroupKey } from "@/lib/falcon-waybill-brand";
import { formatFulfillmentOrderReferenceText } from "@/lib/fulfillment-order-reference";
import { saveOrderWaybill } from "@/lib/order-waybills";
import { prisma } from "@/lib/prisma";
import { getAddressField, resolveOrderCustomerName } from "@/lib/reports/csv";

export { CITYPAK_WAYBILL_SOURCE };

export type CitypakDispatchOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string | null;
  erpnextInvoiceId: string | null;
  sourceName?: string | null;
  financialStatus: string | null;
  totalPrice: { toString(): string } | string | number;
  customerPhone: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  rawPayload?: unknown;
  companyLocationId: string;
};

export type CitypakShipmentAttempt =
  | { status: "skipped" }
  | { status: "booked"; trackingNumber: string | null }
  | { status: "falcon"; error: string };

export async function ensureCitypakShipmentForDispatch(input: {
  companyId: string;
  courierServiceName: string | null | undefined;
  order: CitypakDispatchOrder;
}): Promise<CitypakShipmentAttempt> {
  if (!isCitypakCourier(input.courierServiceName)) {
    return { status: "skipped" };
  }

  try {
    const [location, existingWaybill, accounts] = await Promise.all([
      prisma.companyLocation.findFirst({
        where: { id: input.order.companyLocationId, companyId: input.companyId },
        select: {
          name: true,
          shortName: true,
          locationReference: true,
          manualInvoicePrefix: true,
        },
      }),
      prisma.orderWaybill.findFirst({
        where: {
          companyId: input.companyId,
          orderId: input.order.id,
          source: CITYPAK_WAYBILL_SOURCE,
        },
        select: { id: true, waybillNo: true },
      }),
      prisma.citypakAccount.findMany({
        where: { companyId: input.companyId },
        select: { id: true, label: true, accountId: true, apiToken: true, invoicePrefix: true },
      }),
    ]);

    if (existingWaybill) {
      return { status: "booked", trackingNumber: existingWaybill.waybillNo };
    }

    const reference = formatFulfillmentOrderReferenceText(input.order);
    const locationReference = location?.locationReference ?? "";
    const manualInvoicePrefix = location?.manualInvoicePrefix ?? "";
    const prefix = resolveFalconExportGroupKey({
      reference,
      shopdropRef: reference,
      locationReference,
      manualInvoicePrefix,
      locationName: locationReference || location?.shortName || location?.name,
    });
    const prefixKey = normalizeCitypakPrefix(prefix);
    const account = matchCitypakAccount(accounts, prefix);

    if (!account?.apiToken) {
      return {
        status: "falcon",
        error: `CityPak API not configured for invoice prefix ${prefixKey || prefix}. Use Falcon Upload.`,
      };
    }

    const shippingAddress = input.order.shippingAddress;
    const receiverName = resolveOrderCustomerName({
      shippingAddress,
      billingAddress: input.order.billingAddress,
      rawPayload: input.order.rawPayload,
    });
    const receiverPhone =
      input.order.customerPhone ||
      getAddressField(shippingAddress, "phone") ||
      getAddressField(input.order.billingAddress, "phone");

    const created = await createCitypakOrder({
      token: account.apiToken,
      reference,
      receiverName,
      receiverAddress1: getAddressField(shippingAddress, "address1"),
      receiverAddress2: getAddressField(shippingAddress, "address2"),
      receiverCity: getAddressField(shippingAddress, "city"),
      receiverPhone,
      cashOnDeliveryAmount: citypakCodAmount(
        input.order.financialStatus,
        typeof input.order.totalPrice === "object" ? input.order.totalPrice.toString() : input.order.totalPrice
      ),
      description: getCitypakSender().description,
    });

    if (!created.ok) {
      return { status: "falcon", error: created.error };
    }

    await saveOrderWaybill({
      companyId: input.companyId,
      orderId: input.order.id,
      invoiceNumber: reference,
      waybillNo: created.trackingNumber,
      courierName: input.courierServiceName ?? "City Pack",
      source: CITYPAK_WAYBILL_SOURCE,
      rawPayload: {
        citypakAccountId: account.accountId,
        citypakOrderId: created.orderId,
        trackingNumber: created.trackingNumber,
        reference,
        response: created.raw,
      },
    });

    return { status: "booked", trackingNumber: created.trackingNumber };
  } catch (err) {
    const message = err instanceof Error ? err.message : "CityPak API failed";
    console.error("[citypak-dispatch]", message, err);
    return { status: "falcon", error: message };
  }
}
