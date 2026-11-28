import { Prisma } from "@prisma/client"

import {
  loadPurchaseSummaryIndexes,
  purchaseSummaryForContact,
} from "../lib/contacts/purchase-summary-export"
import { prisma } from "../lib/prisma"

const company = await prisma.company.findFirst({
  where: { name: "SupplementVault.lk" },
  select: { id: true },
})
if (!company) throw new Error("company missing")

const rows = await prisma.adaptPurchaseHistory.findMany({
  where: {
    companyId: company.id,
    adaptInvoiceKey: { startsWith: "vsupp:cos-sv-dump|" },
  },
  select: { contactId: true },
  distinct: ["contactId"],
})
const contactIds = rows.map((r) => r.contactId)
console.log(JSON.stringify({ contacts: contactIds.length }))

const indexes = await loadPurchaseSummaryIndexes(company.id)
const contacts = await prisma.contactMaster.findMany({
  where: { companyId: company.id, id: { in: contactIds } },
  select: {
    id: true,
    phoneNumber: true,
    email: true,
    phones: { select: { phoneNumber: true } },
    emails: { select: { email: true } },
  },
})

const CHUNK = 100
for (let i = 0; i < contacts.length; i += CHUNK) {
  const chunk = contacts.slice(i, i + CHUNK)
  await prisma.$transaction(
    chunk.map((contact) => {
      const summary = purchaseSummaryForContact(indexes, {
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        email: contact.email,
        aliasPhones: contact.phones.map((p) => p.phoneNumber),
        aliasEmails: contact.emails.map((e) => e.email),
      })
      return prisma.contactMaster.update({
        where: { id: contact.id },
        data: {
          purchaseOrderCount: summary?.orderCount ?? 0,
          purchaseTotalValue: new Prisma.Decimal(summary?.totalSpent ?? 0),
          purchaseLastOrderAt: summary?.lastOrderAt ?? null,
        },
      })
    }),
  )
  console.error(`[refresh] ${Math.min(i + CHUNK, contacts.length)}/${contacts.length}`)
}

console.log(JSON.stringify({ refreshed: contacts.length }))
await prisma.$disconnect()
