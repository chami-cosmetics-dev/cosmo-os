import { Prisma } from "@prisma/client";

import { contactOrderLookupKeys } from "@/lib/contact-purchase-lookup";
import {
  attributeLastOrderEventByContact,
  customerLifetimeTotalOrderWhere,
  orderPurchaseAt,
  type ContactOrderLookup,
  type LastOrderEvent,
} from "@/lib/customer-insight/lifetime-total";
import { prisma } from "@/lib/prisma";

/**
 * Contact ids whose latest purchase (Cosmo completed order or Adapt invoice)
 * happened at the given company location.
 */
export async function findContactIdsByLastPurchaseLocation(
  companyId: string,
  locationId: string
): Promise<string[]> {
  const needle = locationId.trim();
  if (!needle) return [];

  const location = await prisma.companyLocation.findFirst({
    where: { id: needle, companyId },
    select: { id: true },
  });
  if (!location) return [];

  const contacts = await prisma.contactMaster.findMany({
    where: { companyId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
    },
  });
  if (contacts.length === 0) return [];

  const lookupByContactId = new Map<string, ContactOrderLookup>();
  for (const contact of contacts) {
    lookupByContactId.set(
      contact.id,
      contactOrderLookupKeys({
        primaryEmail: contact.email,
        primaryPhone: contact.phoneNumber,
        aliasEmails: contact.emails.map((row) => row.email),
        aliasPhones: contact.phones.map((row) => row.phoneNumber),
      })
    );
  }

  const [orders, adaptLatest] = await Promise.all([
    prisma.order.findMany({
      where: {
        companyId,
        ...customerLifetimeTotalOrderWhere(),
      },
      select: {
        customerPhone: true,
        customerEmail: true,
        erpnextCustomerId: true,
        companyLocationId: true,
        createdAt: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
      },
    }),
    prisma.$queryRaw<
      Array<{
        contactId: string;
        companyLocationId: string | null;
        invoiceDate: Date;
      }>
    >(Prisma.sql`
      SELECT DISTINCT ON (a."contactId")
        a."contactId",
        a."companyLocationId",
        a."invoiceDate"
      FROM "AdaptPurchaseHistory" a
      WHERE a."companyId" = ${companyId}
      ORDER BY a."contactId", a."invoiceDate" DESC
    `),
  ]);

  const cosmoLatest = attributeLastOrderEventByContact({
    lookupByContactId,
    orders: orders.map((order) => ({
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      erpnextCustomerId: order.erpnextCustomerId,
      companyLocationId: order.companyLocationId,
      at: orderPurchaseAt(order),
    })),
  });

  const adaptById = new Map<string, LastOrderEvent>();
  for (const row of adaptLatest) {
    adaptById.set(row.contactId, {
      at: row.invoiceDate,
      companyLocationId: row.companyLocationId,
    });
  }

  const matched: string[] = [];
  for (const contact of contacts) {
    const cosmo = cosmoLatest.get(contact.id);
    const adapt = adaptById.get(contact.id);
    let last: LastOrderEvent | null = null;
    if (cosmo && adapt) {
      last =
        cosmo.at.getTime() >= adapt.at.getTime() ? cosmo : adapt;
    } else {
      last = cosmo ?? adapt ?? null;
    }
    if (last?.companyLocationId === needle) {
      matched.push(contact.id);
    }
  }

  return matched;
}
