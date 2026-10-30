import { adaptLineItemsForPurchaseUi } from "@/lib/adapt-import/line-items";
import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { brandFromAdaptLineItem, brandFromVendorName } from "@/lib/customer-insight/brand";
import {
  insightCatalogLabelsBySku,
  insightLineCatalogLabels,
} from "@/lib/customer-insight/line-catalog";
import { getLastContactedAt } from "@/lib/customer-insight/contacted";
import { resolveInsightPhoneCluster } from "@/lib/customer-insight/phone-contact-collapse";
import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";
import {
  buildHistoryScopeDto,
  scopeAdaptRowsForHistory,
  scopeCosmoOrdersForHistory,
  type HistoryScopeInput,
} from "@/lib/customer-insight/history-scope";
import { effectiveLoyaltyTierKey } from "@/lib/customer-insight/erp-loyalty";
import { buildFrequencyMetrics } from "@/lib/customer-insight/frequency";
import { mergeAndPaginateInvoices } from "@/lib/customer-insight/invoices";
import {
  computeLifetimeTotal,
  isAdaptAmountExcludedFromSaleTotal,
  isOrderIncludedInCustomerLifetimeTotal,
  orderPurchaseAt,
} from "@/lib/customer-insight/lifetime-total";
import { parseLoyaltyOutreachStatus } from "@/lib/customer-insight/loyalty-outreach";
import { availableManualLoyaltyTiers } from "@/lib/customer-insight/loyalty-manual";
import { loyaltyCode, loyaltyLabel } from "@/lib/customer-insight/loyalty-tier";
import { viewerIdentityForMerchantFilter } from "@/lib/customer-insight/merchant-label-aliases";
import {
  hasInsightAdminView,
  insightVisibility,
  type ViewerIdentity,
} from "@/lib/customer-insight/ownership";
import {
  buildCustomerInsightDto,
  serializeContactInsight,
  serializeLoyalty,
} from "@/lib/customer-insight/serialize";
import { buildMonthlySeries } from "@/lib/customer-insight/series";
import { aggregateTopItems } from "@/lib/customer-insight/top-items";
import type { CustomerInsightDto, InvoiceLineDto } from "@/lib/customer-insight/types";
import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { prisma } from "@/lib/prisma";
import { skuKey } from "@/lib/vat-status/types";

/**
 * When admin passes viewAsMerchant, ownership/visibility use that merchant's
 * session identity (no admin short-circuit). Non-admins ignore the param.
 */
export async function resolveInsightLoadViewer(input: {
  companyId: string;
  viewer: ViewerIdentity;
  viewAsMerchant?: string | null;
}): Promise<ViewerIdentity> {
  const selected = input.viewAsMerchant?.trim();
  if (!selected || !hasInsightAdminView(input.viewer)) {
    return input.viewer;
  }
  const asMerchant = await viewerIdentityForMerchantFilter(
    input.companyId,
    selected
  );
  return asMerchant ?? input.viewer;
}

function uniqueDisplayPhones(values: Array<string | null>) {
  const phones: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const phone = value?.trim();
    if (!phone) continue;
    const key = canonicalPhoneForErpCustomerId(phone) ?? phone;
    if (seen.has(key)) continue;
    seen.add(key);
    phones.push(phone);
  }
  return phones;
}

export async function loadCustomerInsight(input: {
  companyId: string;
  contactId: string;
  invoicesPage: number;
  invoicesPageSize: number;
  viewer: ViewerIdentity;
  historyBrands?: string[];
  historyItems?: string[];
  /** Admin-only: evaluate visibility as this merchant. */
  viewAsMerchant?: string | null;
  /** False on the follow-up load after jumping to the linked profile. */
  followPhoneCluster?: boolean;
  /** Old contact ids whose Adapt history belongs on this profile. */
  extraAdaptContactIds?: string[];
}): Promise<CustomerInsightDto | null> {
  const contact = await prisma.contactMaster.findFirst({
    where: { id: input.contactId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      birthYear: true,
      birthMonth: true,
      birthDay: true,
      gender: true,
      language: true,
      address: true,
      city: true,
      assignedMerchant: true,
      category: true,
      lastPurchaseAt: true,
      osRegLocation: true,
      osRegBadgeStart: true,
      osRegBadgeEnd: true,
      loyaltyAssignedTier: true,
      loyaltyAssignedAt: true,
      loyaltyAssignedByUserId: true,
      loyaltyAssignedReason: true,
      loyaltyOutreachStatus: true,
      loyaltyAssignedBy: { select: { id: true, name: true, knownName: true } },
      emails: { orderBy: { createdAt: "asc" }, select: { email: true } },
      phones: { orderBy: { createdAt: "asc" }, select: { phoneNumber: true } },
      updatedAt: true,
    },
  });
  if (!contact) return null;

  let adaptContactIds = [contact.id, ...(input.extraAdaptContactIds ?? [])];
  if (input.followPhoneCluster !== false) {
    const cluster = await resolveInsightPhoneCluster(input.companyId, {
      id: contact.id,
      phoneNumber: contact.phoneNumber,
      phones: contact.phones,
      updatedAt: contact.updatedAt,
      assignedMerchant: contact.assignedMerchant,
    });
    if (cluster.keeperId !== contact.id) {
      return loadCustomerInsight({
        ...input,
        contactId: cluster.keeperId,
        followPhoneCluster: false,
        extraAdaptContactIds: cluster.absorbedIds,
      });
    }
    adaptContactIds = [contact.id, ...cluster.absorbedIds];
  }
  adaptContactIds = [...new Set(adaptContactIds.filter(Boolean))];

  const viewer = await resolveInsightLoadViewer({
    companyId: input.companyId,
    viewer: input.viewer,
    viewAsMerchant: input.viewAsMerchant,
  });
  const visibility = insightVisibility(viewer, contact.assignedMerchant);
  const includeRemovedEmails = hasInsightAdminView(viewer);
  const emails = await listContactEmails(contact.id, contact.email);
  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const orderLookupOr = buildContactOrderLookupOr({ phones, emails });
  const displayPhones = uniqueDisplayPhones([
    contact.phoneNumber,
    ...contact.phones.map((p) => p.phoneNumber),
  ]);

  const adaptPromise = prisma.adaptPurchaseHistory.findMany({
    where: { contactId: { in: adaptContactIds }, companyId: input.companyId },
    orderBy: { invoiceDate: "desc" },
    select: {
      id: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
      currency: true,
      lineItems: true,
      locationName: true,
      merchantKnownName: true,
      paymentMethod: true,
      origin: true,
      importBatchId: true,
      financialStatus: true,
      companyLocation: { select: { name: true } },
    },
  });

  const ordersPromise =
    orderLookupOr.length > 0
      ? prisma.order.findMany({
          where: { companyId: input.companyId, OR: orderLookupOr },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            deliveryCompleteAt: true,
            invoiceCompleteAt: true,
            orderNumber: true,
            name: true,
            erpnextInvoiceId: true,
            totalPrice: true,
            currency: true,
            cancelledAt: true,
            financialStatus: true,
            fulfillmentStage: true,
            fulfillmentStatus: true,
            sourceName: true,
            discountCodes: true,
            rawPayload: true,
            companyLocation: { select: { name: true } },
            assignedMerchant: {
              select: { couponCodes: true, knownName: true, name: true, email: true },
            },
            lineItems: {
              select: {
                id: true,
                quantity: true,
                price: true,
                productItem: {
                  select: {
                    productTitle: true,
                    variantTitle: true,
                    sku: true,
                    erp1ProductPriority: true,
                    erp2ProductPriority: true,
                    erp1TaxStatus: true,
                    erp2TaxStatus: true,
                    vendor: { select: { name: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]);

  const lastContactedPromise =
    visibility === "owner"
      ? getLastContactedAt({
          companyId: input.companyId,
          contactId: contact.id,
        })
      : Promise.resolve(null);

  const removedEmailsPromise = includeRemovedEmails
    ? prisma.contactRemovedEmail.findMany({
        where: { companyId: input.companyId, contactId: contact.id },
        orderBy: { removedAt: "desc" },
        select: { email: true, reason: true, removedAt: true },
        take: 50,
      })
    : Promise.resolve([]);

  const notInterestedPromise = prisma.contactAllocationUpdate.findFirst({
    where: {
      companyId: input.companyId,
      contactId: contact.id,
      outcome: "not_interested",
    },
    orderBy: { createdAt: "desc" },
    select: { remark: true },
  });

  const [orders, adaptRows, lastContactedAt, removedEmailRows, notInterestedRow] =
    await Promise.all([
      ordersPromise,
      adaptPromise,
      lastContactedPromise,
      removedEmailsPromise,
      notInterestedPromise,
    ]);

  const historyScope: HistoryScopeInput = {
    brands: input.historyBrands,
    items: input.historyItems,
  };
  const scopedCosmo = scopeCosmoOrdersForHistory(orders, historyScope);
  const scopedAdapt = scopeAdaptRowsForHistory(adaptRows, historyScope);
  const historyOrders = scopedCosmo.orders;
  const historyAdaptRows = scopedAdapt.adaptRows;
  const scopedSpend = scopedCosmo.scopedSpend + scopedAdapt.scopedSpend;
  const historyScopeDto = buildHistoryScopeDto(historyScope, scopedSpend);

  const orderAmounts = orders.map((o) => ({
    totalPrice: o.totalPrice.toString(),
    cancelledAt: o.cancelledAt,
    financialStatus: o.financialStatus,
    fulfillmentStage: o.fulfillmentStage,
  }));
  const adaptAmounts = adaptRows.map((r) => ({
    ttlAmount: r.ttlAmount.toString(),
    financialStatus: r.financialStatus,
  }));
  const lifetimeTotal = computeLifetimeTotal({
    orders: orderAmounts,
    adaptRows: adaptAmounts,
  });

  const loyaltyEligibleDates: Date[] = [];
  for (const o of orders) {
    if (isOrderIncludedInCustomerLifetimeTotal(o)) loyaltyEligibleDates.push(o.createdAt);
  }
  for (const r of adaptRows) {
    if (isAdaptAmountExcludedFromSaleTotal(r.financialStatus)) continue;
    loyaltyEligibleDates.push(r.invoiceDate);
  }

  // Last purchased = newest completed Cosmo order or Adapt invoice, same docs
  // as lifetime / first purchase. ContactMaster.lastPurchaseAt is a stamp that
  // only moves forward and can sit on contacts with no invoice.
  const purchaseDates: number[] = [];
  for (const o of orders) {
    if (!isOrderIncludedInCustomerLifetimeTotal(o)) continue;
    purchaseDates.push(orderPurchaseAt(o).getTime());
  }
  for (const r of adaptRows) {
    if (isAdaptAmountExcludedFromSaleTotal(r.financialStatus)) continue;
    purchaseDates.push(r.invoiceDate.getTime());
  }
  const lastPurchaseAt =
    purchaseDates.length > 0 ? new Date(Math.max(...purchaseDates)) : null;

  const adaptSkus = new Set<string>();
  for (const row of historyAdaptRows) {
    for (const line of adaptLineItemsForPurchaseUi(row.lineItems)) {
      const sku = line.sku?.trim();
      if (sku) adaptSkus.add(sku);
    }
  }
  const adaptCatalogRows =
    adaptSkus.size > 0
      ? await prisma.productItem.findMany({
          where: {
            companyId: input.companyId,
            status: { not: "archived" },
            OR: [...adaptSkus].map((sku) => ({
              sku: { equals: sku, mode: "insensitive" as const },
            })),
          },
          orderBy: { updatedAt: "desc" },
          select: {
            sku: true,
            erp1ProductPriority: true,
            erp2ProductPriority: true,
            erp1TaxStatus: true,
            erp2TaxStatus: true,
          },
        })
      : [];
  const adaptCatalogBySku = insightCatalogLabelsBySku(adaptCatalogRows);

  const seriesEvents = [
    ...historyOrders.map((o) => ({
      date: o.createdAt,
      amount: Number(o.totalPrice.toString()),
      includedInLoyaltyTotal: isOrderIncludedInCustomerLifetimeTotal(o),
    })),
    ...historyAdaptRows.map((r) => ({
      date: r.invoiceDate,
      amount: Number(r.ttlAmount.toString()),
      includedInLoyaltyTotal: !isAdaptAmountExcludedFromSaleTotal(r.financialStatus),
    })),
  ];

  const { series, chartsAvailable } = buildMonthlySeries(seriesEvents);
  const frequency = buildFrequencyMetrics(loyaltyEligibleDates);
  const topItems = aggregateTopItems({
    orders: historyOrders.map((o) => ({
      cancelledAt: o.cancelledAt,
      financialStatus: o.financialStatus,
      fulfillmentStage: o.fulfillmentStage,
      lineItems: o.lineItems.map((li) => ({
        quantity: li.quantity,
        price: li.price.toString(),
        productTitle: li.productItem.productTitle,
        variantTitle: li.productItem.variantTitle,
      })),
    })),
    adaptRows: historyAdaptRows.map((r) => ({
      lineItems: r.lineItems,
      financialStatus: r.financialStatus,
    })),
  });

  const paged = mergeAndPaginateInvoices({
    orders: historyOrders.map((o) => {
      const lineItems: InvoiceLineDto[] = o.lineItems.map((li) => {
        const labels = insightLineCatalogLabels(li.productItem);
        return {
          id: li.id,
          productTitle: li.productItem.productTitle,
          variantTitle: li.productItem.variantTitle,
          sku: li.productItem.sku,
          quantity: li.quantity,
          price: li.price.toString(),
          brand: brandFromVendorName(li.productItem.vendor?.name),
          priority: labels.priority,
          vatStatus: labels.vatStatus,
        };
      });
      return {
        id: o.id,
        createdAt: o.createdAt,
        orderNumber: o.orderNumber,
        name: o.name,
        erpnextInvoiceId: o.erpnextInvoiceId,
        totalPrice: o.totalPrice.toString(),
        currency: o.currency,
        cancelledAt: o.cancelledAt,
        financialStatus: o.financialStatus,
        fulfillmentStage: o.fulfillmentStage,
        fulfillmentStatus: o.fulfillmentStatus,
        locationName: o.companyLocation?.name ?? null,
        discountCouponCode: getOrderDiscountCouponCode({
          sourceName: o.sourceName,
          discountCodes: o.discountCodes,
          rawPayload: o.rawPayload,
        }),
        merchantCouponCode: getMerchantCouponCode({
          sourceName: o.sourceName,
          discountCodes: o.discountCodes,
          rawPayload: o.rawPayload,
          assignedMerchantCouponCodes: o.assignedMerchant?.couponCodes ?? null,
        }),
        merchantName:
          o.assignedMerchant?.knownName?.trim() ||
          o.assignedMerchant?.name?.trim() ||
          o.assignedMerchant?.email?.trim() ||
          null,
        lineItems,
      };
    }),
    adaptRows: historyAdaptRows.map((r) => {
      const rawItems = Array.isArray(r.lineItems) ? r.lineItems : [];
      const lineItems: InvoiceLineDto[] = adaptLineItemsForPurchaseUi(r.lineItems).map(
        (li, idx) => {
          const labels = li.sku ? adaptCatalogBySku.get(skuKey(li.sku)) : undefined;
          return {
            id: li.id,
            productTitle: li.productTitle,
            variantTitle: li.variantTitle,
            sku: li.sku,
            quantity: li.quantity,
            price: li.price,
            brand: brandFromAdaptLineItem(rawItems[idx] ?? null),
            priority: labels?.priority ?? null,
            vatStatus: labels?.vatStatus ?? null,
          };
        },
      );
      return {
        id: r.id,
        invoiceDate: r.invoiceDate,
        salesInvoiceNo: r.salesInvoiceNo,
        ttlAmount: r.ttlAmount.toString(),
        currency: r.currency,
        locationName: r.companyLocation?.name?.trim() || r.locationName || null,
        merchantName: r.merchantKnownName,
        paymentMethod: r.paymentMethod,
        origin: r.origin,
        importBatchId: r.importBatchId,
        financialStatus: r.financialStatus,
        lineItems,
      };
    }),
    page: input.invoicesPage,
    pageSize: input.invoicesPageSize,
  });

  return buildCustomerInsightDto({
    visibility,
    assignedMerchant: contact.assignedMerchant,
    contact: serializeContactInsight({
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      phones: displayPhones,
      email: contact.email,
      gender: contact.gender,
      language: contact.language,
      address: contact.address,
      city: contact.city,
      birthYear: contact.birthYear,
      birthMonth: contact.birthMonth,
      birthDay: contact.birthDay,
      assignedMerchant: contact.assignedMerchant,
      category: contact.category,
      lastPurchaseAt,
      osRegLocation: contact.osRegLocation,
      osRegBadgeStart: contact.osRegBadgeStart,
      osRegBadgeEnd: contact.osRegBadgeEnd,
      removedEmails: includeRemovedEmails ? removedEmailRows : undefined,
    }),
    loyalty: (() => {
      // lifetimeTotal / thresholds from spend; badge key from registration only.
      const computed = serializeLoyalty(lifetimeTotal, "LKR");
      const key = effectiveLoyaltyTierKey(contact.loyaltyAssignedTier);
      return {
        ...computed,
        key,
        label: loyaltyLabel(key),
        code: loyaltyCode(key),
      };
    })(),
    frequency,
    topItems,
    series,
    chartsAvailable,
    invoices: paged.invoices,
    invoicePagination: {
      page: paged.page,
      pageSize: paged.pageSize,
      total: paged.total,
    },
    lastContactedAt,
    canEditProfile: visibility === "owner",
    canMarkContacted: visibility === "owner",
    loyaltyAssignment:
      contact.loyaltyAssignedTier === "gold" ||
      contact.loyaltyAssignedTier === "platinum"
        ? {
            tier: contact.loyaltyAssignedTier,
            assignedAt: contact.loyaltyAssignedAt?.toISOString() ?? "",
            assignedByName:
              contact.loyaltyAssignedBy?.knownName?.trim() ||
              contact.loyaltyAssignedBy?.name?.trim() ||
              (contact.loyaltyAssignedByUserId ? null : "ERP"),
            assignedByUserId: contact.loyaltyAssignedByUserId,
            reason: contact.loyaltyAssignedReason?.trim() || null,
          }
        : null,
    manualLoyaltyTiers: availableManualLoyaltyTiers(
      contact.loyaltyAssignedTier,
      lifetimeTotal
    ),
    loyaltyOutreachStatus: parseLoyaltyOutreachStatus(
      contact.loyaltyOutreachStatus
    ),
    loyaltyNotInterestedReason: notInterestedRow?.remark?.trim() || null,
    historyScope: historyScopeDto,
  });
}
