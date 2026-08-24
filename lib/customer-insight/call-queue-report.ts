import { contactOrderLookupKeys } from "@/lib/contact-purchase-lookup";
import { matchesCallQueuePushBands } from "@/lib/customer-insight/call-queue-push";
import {
  customerLifetimeTotalOrderWhere,
  type ContactOrderLookup,
} from "@/lib/customer-insight/lifetime-total";
import { prisma } from "@/lib/prisma";

function toAmount(value: { toString(): string } | number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type CallQueueReportRow = {
  queueId: string;
  contactId: string;
  name: string;
  phoneNumber: string | null;
  merchantLabel: string;
  assignedAt: string;
  status: string;
  category: string | null;
  lifetimeTotalAtAssign: number;
  salesAfterAssignment: number;
  salesAfterContact: number;
  firstContactAfterAssignAt: string | null;
};

export type CallQueueMerchantSummary = {
  merchantLabel: string;
  assignedCount: number;
  contactedCount: number;
  salesAfterAssignment: number;
  salesAfterContact: number;
};

function purchaseDate(order: {
  invoiceCompleteAt: Date | null;
  deliveryCompleteAt: Date | null;
  createdAt: Date;
}): Date {
  return order.invoiceCompleteAt ?? order.deliveryCompleteAt ?? order.createdAt;
}

export async function listCallQueueSalesReport(input: {
  companyId: string;
  assignedMerchant?: string;
  assignedFrom?: string;
  assignedTo?: string;
  status?: "pending" | "completed";
  pushToGold?: boolean;
  pushToPlatinum?: boolean;
}): Promise<{ rows: CallQueueReportRow[]; byMerchant: CallQueueMerchantSummary[] }> {
  const assignedFrom = input.assignedFrom
    ? new Date(`${input.assignedFrom}T00:00:00.000Z`)
    : null;
  const assignedTo = input.assignedTo
    ? new Date(`${input.assignedTo}T23:59:59.999Z`)
    : null;

  const queueRows = await prisma.contactInsightCallQueue.findMany({
    where: {
      companyId: input.companyId,
      ...(input.assignedMerchant
        ? {
            merchantLabel: {
              equals: input.assignedMerchant,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(assignedFrom || assignedTo
        ? {
            assignedAt: {
              ...(assignedFrom ? { gte: assignedFrom } : {}),
              ...(assignedTo ? { lte: assignedTo } : {}),
            },
          }
        : {}),
    },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      contactId: true,
      merchantLabel: true,
      assignedAt: true,
      status: true,
      lifetimeTotalAtAssign: true,
      contact: {
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          category: true,
          email: true,
          phones: { select: { phoneNumber: true } },
          emails: { select: { email: true } },
        },
      },
    },
  });

  const contactIds = [...new Set(queueRows.map((r) => r.contactId))];
  const contacts = queueRows.map((r) => r.contact);
  const uniqueContacts = [...new Map(contacts.map((c) => [c.id, c])).values()];

  const lookupByContactId = new Map<string, ContactOrderLookup>();
  for (const contact of uniqueContacts) {
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

  const allPhones: string[] = [];
  const allEmails: string[] = [];
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();
  for (const keys of lookupByContactId.values()) {
    for (const phone of keys.phones) {
      if (seenPhone.has(phone)) continue;
      seenPhone.add(phone);
      allPhones.push(phone);
    }
    for (const email of keys.emails) {
      const key = email.trim().toLowerCase();
      if (!key || seenEmail.has(key)) continue;
      seenEmail.add(key);
      allEmails.push(email);
    }
  }

  const hasOrderKeys = allPhones.length > 0 || allEmails.length > 0;

  const [adaptRows, orders, updates] = await Promise.all([
    contactIds.length === 0
      ? Promise.resolve([])
      : prisma.adaptPurchaseHistory.findMany({
          where: { companyId: input.companyId, contactId: { in: contactIds } },
          select: { contactId: true, invoiceDate: true, ttlAmount: true },
        }),
    hasOrderKeys
      ? prisma.order.findMany({
          where: {
            companyId: input.companyId,
            ...customerLifetimeTotalOrderWhere(),
            OR: [
              ...(allPhones.length > 0
                ? [
                    { customerPhone: { in: allPhones } },
                    { erpnextCustomerId: { in: allPhones } },
                  ]
                : []),
              ...(allEmails.length > 0
                ? [
                    {
                      customerEmail: {
                        in: allEmails,
                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),
            ],
          },
          select: {
            customerPhone: true,
            customerEmail: true,
            erpnextCustomerId: true,
            totalPrice: true,
            invoiceCompleteAt: true,
            deliveryCompleteAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    contactIds.length === 0
      ? Promise.resolve([])
      : prisma.contactAllocationUpdate.findMany({
          where: {
            companyId: input.companyId,
            contactId: { in: contactIds },
            NOT: { category: "allocation" },
          },
          select: { contactId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
  ]);

  type SpendHit = { contactId: string; at: Date; amount: number };
  const spends: SpendHit[] = [];
  for (const row of adaptRows) {
    spends.push({
      contactId: row.contactId,
      at: row.invoiceDate,
      amount: toAmount(row.ttlAmount),
    });
  }

  for (const order of orders) {
    const amount = toAmount(order.totalPrice.toString());
    const at = purchaseDate(order);
    const phone = order.customerPhone?.trim() || "";
    const erp = order.erpnextCustomerId?.trim() || "";
    const email = order.customerEmail?.trim().toLowerCase() || "";
    for (const [contactId, keys] of lookupByContactId) {
      if (keys.phones.length > 0) {
        if (
          (phone && keys.phones.includes(phone)) ||
          (erp && keys.phones.includes(erp))
        ) {
          spends.push({ contactId, at, amount });
        }
        continue;
      }
      if (email && keys.emails.some((e) => e.trim().toLowerCase() === email)) {
        spends.push({ contactId, at, amount });
      }
    }
  }

  function sumAfter(contactId: string, after: Date): number {
    let sum = 0;
    for (const hit of spends) {
      if (hit.contactId !== contactId) continue;
      if (hit.at.getTime() > after.getTime()) sum += hit.amount;
    }
    return Math.round(sum * 100) / 100;
  }

  const firstContactByAssign = new Map<string, Date>();
  for (const row of queueRows) {
    const first = updates.find(
      (u) => u.contactId === row.contactId && u.createdAt.getTime() > row.assignedAt.getTime()
    );
    if (first) firstContactByAssign.set(row.id, first.createdAt);
  }

  const pushGold = Boolean(input.pushToGold);
  const pushPlat = Boolean(input.pushToPlatinum);

  const rows: CallQueueReportRow[] = [];
  for (const row of queueRows) {
    const snapshot = toAmount(row.lifetimeTotalAtAssign);
    if (!matchesCallQueuePushBands(snapshot, pushGold, pushPlat) && (pushGold || pushPlat)) {
      continue;
    }
    const firstContact = firstContactByAssign.get(row.id) ?? null;
    rows.push({
      queueId: row.id,
      contactId: row.contactId,
      name: row.contact.name,
      phoneNumber: row.contact.phoneNumber,
      merchantLabel: row.merchantLabel,
      assignedAt: row.assignedAt.toISOString(),
      status: row.status,
      category: row.contact.category,
      lifetimeTotalAtAssign: snapshot,
      salesAfterAssignment: sumAfter(row.contactId, row.assignedAt),
      salesAfterContact: firstContact ? sumAfter(row.contactId, firstContact) : 0,
      firstContactAfterAssignAt: firstContact?.toISOString() ?? null,
    });
  }

  const byMerchantMap = new Map<string, CallQueueMerchantSummary>();
  for (const row of rows) {
    const cur = byMerchantMap.get(row.merchantLabel) ?? {
      merchantLabel: row.merchantLabel,
      assignedCount: 0,
      contactedCount: 0,
      salesAfterAssignment: 0,
      salesAfterContact: 0,
    };
    cur.assignedCount += 1;
    if (row.firstContactAfterAssignAt) cur.contactedCount += 1;
    cur.salesAfterAssignment += row.salesAfterAssignment;
    cur.salesAfterContact += row.salesAfterContact;
    byMerchantMap.set(row.merchantLabel, cur);
  }

  return { rows, byMerchant: [...byMerchantMap.values()] };
}
