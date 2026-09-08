import { isCitypakCourier } from "@/lib/courier";
import {
  CITYPAK_WAYBILL_SOURCE,
  citypakCodAmount,
  createCitypakOrder,
  getCitypakSender,
  matchCitypakAccount,
  mergeShippingAddressWithCitypakOverride,
  normalizeCitypakPrefix,
  type CitypakShipmentOverride,
} from "@/lib/citypak-api";
import { resolveFalconExportGroupKey } from "@/lib/falcon-waybill-brand";
import { formatFulfillmentOrderReferenceText } from "@/lib/fulfillment-order-reference";
import { saveOrderWaybill } from "@/lib/order-waybills";
import { prisma } from "@/lib/prisma";
import { getAddressField, resolveOrderCustomerName } from "@/lib/reports/csv";

export type { CitypakShipmentOverride };

export { CITYPAK_WAYBILL_SOURCE };

export type CitypakDispatchOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string | null;
  erpnextInvoiceId: string | null;
  sourceName?: string | null;
  financialStatus: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  totalPrice: { toString(): string } | string | number;
  customerPhone: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  rawPayload?: unknown;
  companyLocationId: string;
};

export type CitypakShipmentAttempt =
  | { status: "skipped" }
  | { status: "booked"; trackingNumber: string | null; waybillId?: string | null }
  | { status: "falcon"; error: string };

export function citypakOverrideOrderPatch(input: {
  shippingAddress: unknown;
  override: CitypakShipmentOverride;
}) {
  return {
    shippingAddress: mergeShippingAddressWithCitypakOverride(
      input.shippingAddress,
      input.override
    ),
    customerPhone: input.override.receiverPhone,
  };
}

export async function ensureCitypakShipmentForDispatch(input: {
  companyId: string;
  courierServiceName: string | null | undefined;
  order: CitypakDispatchOrder;
  shipmentOverride?: CitypakShipmentOverride | null;
  /** Links booked waybill into a bulk WaybillUpload history batch. */
  uploadId?: string | null;
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
      if (input.uploadId) {
        await prisma.orderWaybill.updateMany({
          where: {
            id: existingWaybill.id,
            companyId: input.companyId,
            uploadId: null,
          },
          data: { uploadId: input.uploadId },
        });
      }
      return { status: "booked", trackingNumber: existingWaybill.waybillNo, waybillId: existingWaybill.id };
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

    const override = input.shipmentOverride;
    const shippingAddress = override
      ? mergeShippingAddressWithCitypakOverride(input.order.shippingAddress, override)
      : input.order.shippingAddress;
    const receiverName = override?.receiverName
      || resolveOrderCustomerName({
        shippingAddress,
        billingAddress: input.order.billingAddress,
        rawPayload: input.order.rawPayload,
      });
    const receiverPhone =
      override?.receiverPhone ||
      input.order.customerPhone ||
      getAddressField(shippingAddress, "phone") ||
      getAddressField(input.order.billingAddress, "phone");
    const cashOnDeliveryAmount =
      override?.cashOnDeliveryAmount != null
        ? override.cashOnDeliveryAmount
        : citypakCodAmount(
            input.order.financialStatus,
            typeof input.order.totalPrice === "object" ? input.order.totalPrice.toString() : input.order.totalPrice,
            {
              paymentGatewayPrimary: input.order.paymentGatewayPrimary,
              paymentGatewayNames: input.order.paymentGatewayNames,
            }
          );

    const created = await createCitypakOrder({
      token: account.apiToken,
      reference,
      receiverName,
      receiverAddress1: override?.receiverAddress1 || getAddressField(shippingAddress, "address1"),
      receiverAddress2: override?.receiverAddress2 ?? getAddressField(shippingAddress, "address2"),
      receiverCity: override?.receiverCity || getAddressField(shippingAddress, "city"),
      receiverPhone,
      cashOnDeliveryAmount,
      description: getCitypakSender().description,
    });

    if (!created.ok) {
      return { status: "falcon", error: created.error };
    }

    const waybillId = await saveOrderWaybill({
      companyId: input.companyId,
      orderId: input.order.id,
      invoiceNumber: reference,
      waybillNo: created.trackingNumber,
      courierName: input.courierServiceName ?? "City Pack",
      source: CITYPAK_WAYBILL_SOURCE,
      uploadId: input.uploadId ?? null,
      rawPayload: {
        citypakAccountId: account.accountId,
        citypakAccountDbId: account.id,
        citypakOrderId: created.orderId,
        trackingNumber: created.trackingNumber,
        reference,
        response: created.raw,
      },
    });

    return { status: "booked", trackingNumber: created.trackingNumber, waybillId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "CityPak API failed";
    console.error("[citypak-dispatch]", message, err);
    return { status: "falcon", error: message };
  }
}

export async function createCitypakManualShipment(input: {
  companyId: string;
  courierServiceName: string | null | undefined;
  accountDbId: string;
  reference: string;
  shipment: CitypakShipmentOverride;
  uploadId?: string | null;
}): Promise<CitypakShipmentAttempt & { waybillId?: string | null }> {
  try {
  const account = await prisma.citypakAccount.findFirst({
    where: { id: input.accountDbId, companyId: input.companyId },
    select: { id: true, accountId: true, apiToken: true, invoicePrefix: true, label: true },
  });
  if (!account?.apiToken) {
    return { status: "falcon", error: "CityPak account not found or token missing" };
  }

  const created = await createCitypakOrder({
    token: account.apiToken,
    reference: input.reference,
    receiverName: input.shipment.receiverName,
    receiverAddress1: input.shipment.receiverAddress1,
    receiverAddress2: input.shipment.receiverAddress2,
    receiverCity: input.shipment.receiverCity,
    receiverPhone: input.shipment.receiverPhone,
    cashOnDeliveryAmount: input.shipment.cashOnDeliveryAmount ?? 0,
    description: getCitypakSender().description,
  });

  if (!created.ok) {
    return { status: "falcon", error: created.error };
  }

  const waybillId = await saveOrderWaybill({
    companyId: input.companyId,
    orderId: null,
    invoiceNumber: input.reference,
    waybillNo: created.trackingNumber,
    courierName: input.courierServiceName ?? "City Pack",
    source: CITYPAK_WAYBILL_SOURCE,
    uploadId: input.uploadId ?? null,
    rawPayload: {
      manual: true,
      citypakAccountId: account.accountId,
      citypakAccountDbId: account.id,
      citypakOrderId: created.orderId,
      trackingNumber: created.trackingNumber,
      reference: input.reference,
      response: created.raw,
    },
  });

  return {
    status: "booked",
    trackingNumber: created.trackingNumber,
    waybillId,
  };
  } catch (err) {
    const message = err instanceof Error ? err.message : "CityPak API failed";
    console.error("[citypak-dispatch] manual", message, err);
    return { status: "falcon", error: message };
  }
}
