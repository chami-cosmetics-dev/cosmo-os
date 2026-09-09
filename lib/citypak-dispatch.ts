import { isCitypakCourier } from "@/lib/courier";
import {
  CITYPAK_BULK_CREATE_GAP_MS,
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
import { Prisma } from "@prisma/client";

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
  /** Held for another CityPak API try — excluded from Falcon Upload until released. */
  | { status: "retry"; error: string; attempts: number }
  /** Staff chose Falcon / config forces manual upload. */
  | { status: "falcon"; error: string };

/** How many create-order attempts in one dispatch/retry action (includes the first try). */
export const CITYPAK_BOOK_MAX_ATTEMPTS = 3;

const CITYPAK_RETRY_KEY = "citypakApiRetry";

function asOrderPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

export function isCitypakApiRetryPending(rawPayload: unknown): boolean {
  const payload = asOrderPayload(rawPayload);
  const retry = payload[CITYPAK_RETRY_KEY];
  return Boolean(
    retry &&
      typeof retry === "object" &&
      !Array.isArray(retry) &&
      (retry as { pending?: unknown }).pending === true
  );
}

export async function markCitypakApiRetryPending(input: {
  companyId: string;
  orderId: string;
  error: string;
  attempts: number;
}): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: { rawPayload: true },
  });
  if (!order) return;
  const payload = asOrderPayload(order.rawPayload);
  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      rawPayload: {
        ...payload,
        [CITYPAK_RETRY_KEY]: {
          pending: true,
          error: input.error,
          attempts: input.attempts,
          failedAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  });
}

export async function clearCitypakApiRetryPending(input: {
  companyId: string;
  orderId: string;
}): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: { rawPayload: true },
  });
  if (!order) return;
  const payload = asOrderPayload(order.rawPayload);
  if (!(CITYPAK_RETRY_KEY in payload)) return;
  const next = { ...payload };
  delete next[CITYPAK_RETRY_KEY];
  await prisma.order.update({
    where: { id: input.orderId },
    data: { rawPayload: next as Prisma.InputJsonValue },
  });
}

/** Drop the hold so the order appears on Falcon Upload for manual file flow. */
export async function releaseCitypakApiToFalcon(input: {
  companyId: string;
  orderId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: { id: true, rawPayload: true },
  });
  if (!order) return { ok: false, error: "Order not found." };
  const payload = asOrderPayload(order.rawPayload);
  const prev = payload[CITYPAK_RETRY_KEY];
  await prisma.order.update({
    where: { id: order.id },
    data: {
      rawPayload: {
        ...payload,
        [CITYPAK_RETRY_KEY]: {
          ...(prev && typeof prev === "object" && !Array.isArray(prev) ? prev : {}),
          pending: false,
          releasedToFalconAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  });
  return { ok: true };
}

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
      // Not a transient API error — needs settings or Falcon file.
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

    const shipmentBody = {
      token: account.apiToken,
      reference,
      receiverName,
      receiverAddress1: override?.receiverAddress1 || getAddressField(shippingAddress, "address1"),
      receiverAddress2: override?.receiverAddress2 ?? getAddressField(shippingAddress, "address2"),
      receiverCity: override?.receiverCity || getAddressField(shippingAddress, "city"),
      receiverPhone,
      cashOnDeliveryAmount,
      description: getCitypakSender().description,
    };

    let lastError = "CityPak API failed";
    for (let attempt = 1; attempt <= CITYPAK_BOOK_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        await new Promise((resolve) => setTimeout(resolve, CITYPAK_BULK_CREATE_GAP_MS));
      }
      const created = await createCitypakOrder(shipmentBody);
      if (created.ok) {
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
            shipment: {
              receiverName,
              receiverAddress1: shipmentBody.receiverAddress1,
              receiverAddress2: shipmentBody.receiverAddress2,
              receiverCity: shipmentBody.receiverCity,
              receiverPhone,
              cashOnDeliveryAmount,
            },
            response: created.raw,
          },
        });
        await clearCitypakApiRetryPending({
          companyId: input.companyId,
          orderId: input.order.id,
        });
        return { status: "booked", trackingNumber: created.trackingNumber, waybillId };
      }
      lastError = created.error;
      console.warn(
        `[citypak-dispatch] create attempt ${attempt}/${CITYPAK_BOOK_MAX_ATTEMPTS} failed for ${reference}:`,
        created.error
      );
    }

    await markCitypakApiRetryPending({
      companyId: input.companyId,
      orderId: input.order.id,
      error: lastError,
      attempts: CITYPAK_BOOK_MAX_ATTEMPTS,
    });
    return { status: "retry", error: lastError, attempts: CITYPAK_BOOK_MAX_ATTEMPTS };
  } catch (err) {
    const message = err instanceof Error ? err.message : "CityPak API failed";
    console.error("[citypak-dispatch]", message, err);
    await markCitypakApiRetryPending({
      companyId: input.companyId,
      orderId: input.order.id,
      error: message,
      attempts: 1,
    });
    return { status: "retry", error: message, attempts: 1 };
  }
}

/**
 * Save edited receiver details for reprint. Tracking number stays the same —
 * CityPak is not cancelled or re-booked. The next print stamps these fields on the waybill.
 */
export async function updateCitypakWaybillPrintDetails(input: {
  companyId: string;
  waybillId: string;
  shipment: CitypakShipmentOverride;
}): Promise<{ ok: true; trackingNumber: string } | { ok: false; error: string }> {
  const waybill = await prisma.orderWaybill.findFirst({
    where: { id: input.waybillId, companyId: input.companyId, source: CITYPAK_WAYBILL_SOURCE },
    select: {
      id: true,
      orderId: true,
      waybillNo: true,
      rawPayload: true,
      order: { select: { shippingAddress: true } },
    },
  });
  if (!waybill) return { ok: false, error: "CityPak waybill not found." };

  const payload =
    waybill.rawPayload && typeof waybill.rawPayload === "object" && !Array.isArray(waybill.rawPayload)
      ? (waybill.rawPayload as Record<string, unknown>)
      : {};

  await prisma.orderWaybill.update({
    where: { id: waybill.id },
    data: {
      rawPayload: {
        ...payload,
        shipment: input.shipment,
        printOverride: true,
        printOverrideAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  if (waybill.orderId) {
    const patch = citypakOverrideOrderPatch({
      shippingAddress: waybill.order?.shippingAddress ?? null,
      override: input.shipment,
    });
    await prisma.order.updateMany({
      where: { id: waybill.orderId, companyId: input.companyId },
      data: {
        shippingAddress: patch.shippingAddress as Prisma.InputJsonValue,
        customerPhone: patch.customerPhone,
      },
    });
  }

  return { ok: true, trackingNumber: waybill.waybillNo };
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
      shipment: input.shipment,
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
