import { contactOrderLookupKeys } from "@/lib/contact-purchase-lookup";
import {
  customerLifetimeTotalOrderWhere,
  orderPurchaseAt,
} from "@/lib/customer-insight/lifetime-total";
import { chunkArray } from "@/lib/customer-insight/purchase-scan";
import { prisma } from "@/lib/prisma";

const ID_CHUNK = 400;

export function earlierDate(
  a: Date | null | undefined,
  b: Date | null | undefined
): Date | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Earliest completed Cosmo order or Adapt invoice per contact.
 * Phone-keyed contacts match phone only; email-keyed contacts match email.
 */
export async function firstPurchaseAtByContactIds(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  const ids = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, Date>();
  if (ids.length === 0) return out;

  const orderSelect = {
    customerPhone: true,
    customerEmail: true,
    erpnextCustomerId: true,
    createdAt: true,
    deliveryCompleteAt: true,
    invoiceCompleteAt: true,
  } as const;

  for (const slice of chunkArray(ids, ID_CHUNK)) {
    const phoneToIds = new Map<string, string[]>();
    const emailToIds = new Map<string, string[]>();
    const [contacts, adapt] = await Promise.all([
      prisma.contactMaster.findMany({
        where: { companyId, id: { in: slice } },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          phones: { select: { phoneNumber: true } },
          emails: { select: { email: true } },
        },
      }),
      prisma.adaptPurchaseHistory.groupBy({
        by: ["contactId"],
        where: { companyId, contactId: { in: slice } },
        _min: { invoiceDate: true },
      }),
    ]);

    for (const row of adapt) {
      if (!row._min.invoiceDate) continue;
      out.set(row.contactId, earlierDate(out.get(row.contactId), row._min.invoiceDate)!);
    }

    for (const contact of contacts) {
      const keys = contactOrderLookupKeys({
        primaryEmail: contact.email,
        primaryPhone: contact.phoneNumber,
        aliasEmails: contact.emails.map((row) => row.email),
        aliasPhones: contact.phones.map((row) => row.phoneNumber),
      });
      if (keys.phones.length > 0) {
        for (const phone of keys.phones) {
          if (!phone) continue;
          const list = phoneToIds.get(phone) ?? [];
          list.push(contact.id);
          phoneToIds.set(phone, list);
        }
        continue;
      }
      for (const email of keys.emails) {
        const key = email.trim().toLowerCase();
        if (!key) continue;
        const list = emailToIds.get(key) ?? [];
        list.push(contact.id);
        emailToIds.set(key, list);
      }
    }

    const phones = [...phoneToIds.keys()];
    const emails = [...emailToIds.keys()];
    const orderPages = await Promise.all([
      ...chunkArray(phones, 200).map((phoneSlice) =>
        prisma.order.findMany({
          where: {
            companyId,
            ...customerLifetimeTotalOrderWhere(),
            OR: [
              { customerPhone: { in: phoneSlice } },
              { erpnextCustomerId: { in: phoneSlice } },
            ],
          },
          select: orderSelect,
        })
      ),
      ...chunkArray(emails, 40).map((emailSlice) =>
        prisma.order.findMany({
          where: {
            companyId,
            ...customerLifetimeTotalOrderWhere(),
            OR: emailSlice.map((email) => ({
              customerEmail: { equals: email, mode: "insensitive" as const },
            })),
          },
          select: orderSelect,
        })
      ),
    ]);

    for (const order of orderPages.flat()) {
      const at = orderPurchaseAt(order);
      const matched = new Set<string>();
      const phone = order.customerPhone?.trim() || "";
      if (phone) {
        for (const id of phoneToIds.get(phone) ?? []) matched.add(id);
      }
      const erp = order.erpnextCustomerId?.trim() || "";
      if (erp) {
        for (const id of phoneToIds.get(erp) ?? []) matched.add(id);
      }
      const email = order.customerEmail?.trim().toLowerCase() || "";
      if (email) {
        for (const id of emailToIds.get(email) ?? []) matched.add(id);
      }
      for (const id of matched) {
        out.set(id, earlierDate(out.get(id), at)!);
      }
    }
  }

  return out;
}
