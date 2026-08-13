import { adaptLineItemsForPurchaseUi } from "@/lib/adapt-import/line-items";
import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { brandFromAdaptLineItem, brandFromVendorName } from "@/lib/customer-insight/brand";
import { getLastContactedAt } from "@/lib/customer-insight/contacted";
import {
  buildHistoryScopeDto,
  scopeAdaptRowsForHistory,
  scopeCosmoOrdersForHistory,
  type HistoryScopeInput,
} from "@/lib/customer-insight/history-scope";
import { effectiveLoyaltyTierKey } from "@/lib/customer-insight/erp-loyalty";
import { buildFrequencyMetrics } from "@/lib/customer-insight/frequency";
import { mergeAndPaginateInvoices } from "@/lib/customer-insight/invoices";
import { computeLifetimeTotal, isOrderIncludedInCustomerLifetimeTotal } from "@/lib/customer-insight/lifetime-total";
import { loyaltyCode, loyaltyLabel } from "@/lib/customer-insight/loyalty-tier";
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
import { prisma } from "@/lib/prisma";

function uniqueDisplayPhones(values: Array<string | null>) {
  const phones: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const phone = value?.trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
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
  historyBrand?: string | null;
  historyItem?: string | null;
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
      loyaltyAssignedTier: true,
      loyaltyAssignedAt: true,
      loyaltyAssignedByUserId: true,
      loyaltyAssignedBy: { select: { id: true, name: true, knownName: true } },
      emails: { orderBy: { createdAt: "asc" }, select: { email: true } },
      phones: { orderBy: { createdAt: "asc" }, select: { phoneNumber: true } },
    },
  });
  if (!contact) return null;

  const visibility = insightVisibility(input.viewer, contact.assignedMerchant);
  const includeRemovedEmails = hasInsightAdminView(input.viewer);
  const emails = await listContactEmails(contact.id, contact.email);
  const phones = await listContactPhones(contact.id, contact.phoneNumber);
  const orderLookupOr = buildContactOrderLookupOr({ phones, emails });
  const displayPhones = uniqueDisplayPhones([
    contact.phoneNumber,
    ...contact.phones.map((p) => p.phoneNumber),
  ]);

  const adaptPromise = prisma.adaptPurchaseHistory.findMany({
    where: { contactId: contact.id, companyId: input.companyId },
    orderBy: { invoiceDate: "desc" },
    select: {
      id: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
      currency: true,
      lineItems: true,
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
            orderNumber: true,
            name: true,
            erpnextInvoiceId: true,
            totalPrice: true,
            currency: true,
            cancelledAt: true,
            financialStatus: true,
            fulfillmentStage: true,
            fulfillmentStatus: true,
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

  const [orders, adaptRows, lastContactedAt, removedEmailRows] = await Promise.all([
    ordersPromise,
    adaptPromise,
    lastContactedPromise,
    removedEmailsPromise,
  ]);

  const historyScope: HistoryScopeInput = {
    brand: input.historyBrand,
    item: input.historyItem,
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
    loyaltyEligibleDates.push(r.invoiceDate);
  }

  const seriesEvents = [
    ...historyOrders.map((o) => ({
      date: o.createdAt,
      amount: Number(o.totalPrice.toString()),
      includedInLoyaltyTotal: isOrderIncludedInCustomerLifetimeTotal(o),
    })),
    ...historyAdaptRows.map((r) => ({
      date: r.invoiceDate,
      amount: Number(r.ttlAmount.toString()),
      includedInLoyaltyTotal: true,
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
    adaptRows: historyAdaptRows.map((r) => ({ lineItems: r.lineItems })),
  });

  const paged = mergeAndPaginateInvoices({
    orders: historyOrders.map((o) => {
      const lineItems: InvoiceLineDto[] = o.lineItems.map((li) => ({
        id: li.id,
        productTitle: li.productItem.productTitle,
        variantTitle: li.productItem.variantTitle,
        sku: li.productItem.sku,
        quantity: li.quantity,
        price: li.price.toString(),
        brand: brandFromVendorName(li.productItem.vendor?.name),
      }));
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
        lineItems,
      };
    }),
    adaptRows: historyAdaptRows.map((r) => {
      const rawItems = Array.isArray(r.lineItems) ? r.lineItems : [];
      const lineItems: InvoiceLineDto[] = adaptLineItemsForPurchaseUi(r.lineItems).map(
        (li, idx) => ({
          id: li.id,
          productTitle: li.productTitle,
          variantTitle: li.variantTitle,
          sku: li.sku,
          quantity: li.quantity,
          price: li.price,
          brand: brandFromAdaptLineItem(rawItems[idx] ?? null),
        })
      );
      return {
        id: r.id,
        invoiceDate: r.invoiceDate,
        salesInvoiceNo: r.salesInvoiceNo,
        ttlAmount: r.ttlAmount.toString(),
        currency: r.currency,
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
      lastPurchaseAt: contact.lastPurchaseAt,
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
          }
        : null,
    historyScope: historyScopeDto,
  });
}
