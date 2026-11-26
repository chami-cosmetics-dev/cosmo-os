import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"
import { buildPhoneLookupVariants } from "../lib/phone-lookup"
import { isOrderReversed } from "../lib/customer-insight/lifetime-total"
import { isOrderIncludedInCustomerLifetimeTotal } from "../lib/customer-insight/lifetime-total"
import { isAdaptAmountExcludedFromSaleTotal } from "../lib/customer-insight/lifetime-total"

config({ path: ".env" })

const prisma = new PrismaClient()

const SAMPLE_PHONES = [
  "0779975799", // stamp today, adapt 2023 only
  "0777231808", // stamp today, cosmo Nov 10
  "0768334788", // stamp midnight, cosmo same day
  "+94715346301", // +94 format
  "0715218862", // Miss Jithmi
]

function dayKey(d: Date | null | undefined) {
  if (!d) return null
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" })
}

async function inspectPhone(companyId: string, phone: string) {
  const variants = buildPhoneLookupVariants(phone)
  const contact = await prisma.contactMaster.findFirst({
    where: {
      companyId,
      OR: [
        { phoneNumber: { in: variants } },
        { phones: { some: { phoneNumber: { in: variants } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      lastPurchaseAt: true,
      purchaseLastOrderAt: true,
      purchaseFirstOrderAt: true,
    },
  })

  if (!contact) {
    console.log("\n===", phone, "NO CONTACT ===")
    return
  }

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      OR: [
        { customerPhone: { in: variants } },
        { erpnextCustomerId: { in: variants } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
      orderNumber: true,
      createdAt: true,
      deliveryCompleteAt: true,
      invoiceCompleteAt: true,
      cancelledAt: true,
      financialStatus: true,
      fulfillmentStage: true,
      customerPhone: true,
    },
  })

  const adapt = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId, contactId: contact.id },
    orderBy: { invoiceDate: "desc" },
    take: 5,
    select: {
      salesInvoiceNo: true,
      invoiceDate: true,
      financialStatus: true,
      ttlAmount: true,
      origin: true,
    },
  })

  const nonReversed = orders.filter((o) => !isOrderReversed(o))
  const lifetimeEligible = orders.filter((o) =>
    isOrderIncludedInCustomerLifetimeTotal(o)
  )
  const adaptEligible = adapt.filter(
    (r) => !isAdaptAmountExcludedFromSaleTotal(r.financialStatus)
  )

  const latestPlaced = nonReversed[0]?.createdAt ?? null
  const latestCompletedCreated = lifetimeEligible[0]?.createdAt ?? null
  const latestAdapt = adaptEligible[0]?.invoiceDate ?? null

  const invoiceCandidates = [latestCompletedCreated, latestAdapt].filter(
    Boolean
  ) as Date[]
  const maxInvoiceCreated =
    invoiceCandidates.length > 0
      ? new Date(Math.max(...invoiceCandidates.map((d) => d.getTime())))
      : null

  console.log("\n===", contact.name, contact.phoneNumber, "===")
  console.log({
    contactId: contact.id,
    stamp_lastPurchaseAt: contact.lastPurchaseAt,
    stamp_day: dayKey(contact.lastPurchaseAt),
    cache_purchaseLastOrderAt: contact.purchaseLastOrderAt,
    cache_day: dayKey(contact.purchaseLastOrderAt),
    latest_placed_order: latestPlaced,
    latest_placed_day: dayKey(latestPlaced),
    latest_completed_order_created: latestCompletedCreated,
    latest_completed_day: dayKey(latestCompletedCreated),
    latest_adapt_invoice: latestAdapt,
    latest_adapt_day: dayKey(latestAdapt),
    max_invoice_created: maxInvoiceCreated,
    max_invoice_day: dayKey(maxInvoiceCreated),
    stamp_matches_placed_day:
      dayKey(contact.lastPurchaseAt) === dayKey(latestPlaced),
    stamp_matches_completed_invoice_day:
      dayKey(contact.lastPurchaseAt) === dayKey(maxInvoiceCreated),
    stamp_matches_cache_day:
      dayKey(contact.lastPurchaseAt) === dayKey(contact.purchaseLastOrderAt),
  })
  console.log(
    "orders",
    orders.map((o) => ({
      name: o.name,
      created: o.createdAt,
      stage: o.fulfillmentStage,
      fin: o.financialStatus,
      cancelled: !!o.cancelledAt,
      reversed: isOrderReversed(o),
      lifetime: isOrderIncludedInCustomerLifetimeTotal(o),
      phone: o.customerPhone,
    }))
  )
  console.log(
    "adapt",
    adapt.map((r) => ({
      no: r.salesInvoiceNo,
      date: r.invoiceDate,
      status: r.financialStatus,
      origin: r.origin,
      excluded: isAdaptAmountExcludedFromSaleTotal(r.financialStatus),
    }))
  )
}

async function aggregateRules(companyId: string) {
  // Stamp vs cache day mismatch already known (~7.9k).
  // Count stamps that look like date-only (midnight UTC).
  const midnight = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(`
    SELECT
      COUNT(*) FILTER (
        WHERE "lastPurchaseAt" IS NOT NULL
          AND ("lastPurchaseAt" AT TIME ZONE 'UTC')::time = time '00:00:00'
      )::int AS stamp_midnight_utc,
      COUNT(*) FILTER (
        WHERE "lastPurchaseAt" IS NOT NULL
          AND ("lastPurchaseAt" AT TIME ZONE 'UTC')::time <> time '00:00:00'
      )::int AS stamp_not_midnight
    FROM "ContactMaster"
    WHERE "companyId" = '${companyId}'
  `)
  console.log("\nstamp shape", midnight)

  // Recent stamps with no completed Cosmo order and no Adapt row on that day
  // (likely placed-but-not-complete, or identity miss).
  const recentOrphans = await prisma.$queryRawUnsafe<
    Array<Record<string, unknown>>
  >(`
    SELECT
      c.id, c.name, c."phoneNumber",
      c."lastPurchaseAt", c."purchaseLastOrderAt"
    FROM "ContactMaster" c
    WHERE c."companyId" = '${companyId}'
      AND c."lastPurchaseAt" >= NOW() - interval '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM "AdaptPurchaseHistory" a
        WHERE a."contactId" = c.id
          AND date_trunc('day', a."invoiceDate" AT TIME ZONE 'Asia/Colombo')
            = date_trunc('day', c."lastPurchaseAt" AT TIME ZONE 'Asia/Colombo')
      )
    ORDER BY c."lastPurchaseAt" DESC
    LIMIT 15
  `)
  console.log("\nrecent stamps with no same-day Adapt invoice (15):")
  for (const row of recentOrphans) {
    console.log(row)
  }
}

async function main() {
  const company = await prisma.company.findFirst({
    select: { id: true, name: true },
  })
  if (!company) throw new Error("no company")
  console.log("company", company)

  for (const phone of SAMPLE_PHONES) {
    await inspectPhone(company.id, phone)
  }
  await aggregateRules(company.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
