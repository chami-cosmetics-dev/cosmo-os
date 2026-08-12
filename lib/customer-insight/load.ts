import { adaptLineItemsForPurchaseUi } from "@/lib/adapt-import/line-items";
import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { brandFromAdaptLineItem, brandFromVendorName } from "@/lib/customer-insight/brand";
import { getLastContactedAt } from "@/lib/customer-insight/contacted";
import { buildFrequencyMetrics } from "@/lib/customer-insight/frequency";
import { mergeAndPaginateInvoices } from "@/lib/customer-insight/invoices";
import { computeLifetimeTotal } from "@/lib/customer-insight/lifetime-total";
import {
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
      assignedMerchant: true,
      category: true,
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

  const [orders, adaptRows, lastContactedAt] = await Promise.all([
    ordersPromise,
    adaptPromise,
    lastContactedPromise,
  ]);

  const orderAmounts = orders.map((o) => ({
    totalPrice: o.totalPrice.toString(),
    cancelledAt: o.cancelledAt,
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
    if (!o.cancelledAt) loyaltyEligibleDates.push(o.createdAt);
  }
  for (const r of adaptRows) {
    loyaltyEligibleDates.push(r.invoiceDate);
  }

  const seriesEvents = [
    ...orders.map((o) => ({
      date: o.createdAt,
      amount: Number(o.totalPrice.toString()),
      includedInLoyaltyTotal: !o.cancelledAt,
    })),
    ...adaptRows.map((r) => ({
      date: r.invoiceDate,
      amount: Number(r.ttlAmount.toString()),
      includedInLoyaltyTotal: true,
    })),
  ];

  const { series, chartsAvailable } = buildMonthlySeries(seriesEvents);
  const frequency = buildFrequencyMetrics(loyaltyEligibleDates);
  const topItems = aggregateTopItems({
    orders: orders.map((o) => ({
      cancelledAt: o.cancelledAt,
      lineItems: o.lineItems.map((li) => ({
        quantity: li.quantity,
        price: li.price.toString(),
        productTitle: li.productItem.productTitle,
        variantTitle: li.productItem.variantTitle,
      })),
    })),
    adaptRows: adaptRows.map((r) => ({ lineItems: r.lineItems })),
  });

  const paged = mergeAndPaginateInvoices({
    orders: orders.map((o) => {
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
        fulfillmentStatus: o.fulfillmentStatus,
        lineItems,
      };
    }),
    adaptRows: adaptRows.map((r) => {
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
      birthYear: contact.birthYear,
      birthMonth: contact.birthMonth,
      birthDay: contact.birthDay,
      assignedMerchant: contact.assignedMerchant,
      category: contact.category,
    }),
    loyalty: serializeLoyalty(lifetimeTotal, "LKR"),
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
              null,
            assignedByUserId: contact.loyaltyAssignedByUserId,
          }
        : null,
  });
}
