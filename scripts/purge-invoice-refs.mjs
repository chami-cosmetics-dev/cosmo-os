/**
 * Purge invoice numbers from Vault/Cosmo OS DB everywhere they feed UI:
 * Order, AdaptPurchaseHistory (customer insight / dump history),
 * OrderWaybill, PhysicalConsultation, BookNoteRow.
 *
 * Usage:
 *   node scripts/with-env.mjs vault node scripts/purge-invoice-refs.mjs --file refs.txt
 *   node scripts/with-env.mjs vault node scripts/purge-invoice-refs.mjs --file refs.txt --apply
 *   node scripts/with-env.mjs vault node scripts/purge-invoice-refs.mjs SV1008857 ACC-SINV-2026-00011 --apply
 *
 * After --apply, recalculate contact last-purchase for touched contacts when needed.
 */
import { readFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const fileIdx = args.indexOf("--file")
const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null

const fromArgs = args.filter(
  (a, i) =>
    !a.startsWith("--") &&
    a !== filePath &&
    !(fileIdx >= 0 && i === fileIdx + 1),
)

const fromFile = filePath
  ? readFileSync(filePath, "utf8")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  : []

const refs = [...new Set([...fromArgs, ...fromFile].map((s) => s.trim()).filter(Boolean))]

if (refs.length === 0) {
  console.error(
    "Usage: node scripts/purge-invoice-refs.mjs [--file refs.txt] [ref...] [--apply]",
  )
  process.exit(1)
}

const rawUrl = process.env.DATABASE_URL ?? ""
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2")
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
})

const orderOr = refs.flatMap((ref) => [
  { name: ref },
  { orderNumber: ref },
  { erpnextInvoiceId: ref },
  { shopifyOrderId: ref },
  { shopifyOrderId: `erp-${ref}` },
])

const adaptOr = refs.flatMap((ref) => [
  { salesInvoiceNo: ref },
  { salesInvoiceMasterId: ref },
  { adaptInvoiceKey: ref },
])

const summarize = (rows, pick) =>
  rows.slice(0, 40).map(pick)

async function main() {
  const [orders, adaptRows, waybills, consultations, bookNoteRows] =
    await Promise.all([
      prisma.order.findMany({
        where: { OR: orderOr },
        select: {
          id: true,
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
          erpnextInvoiceId: true,
          customerId: true,
          totalPrice: true,
          sourceName: true,
          fulfillmentStage: true,
          companyLocation: { select: { name: true } },
          _count: {
            select: {
              lineItems: true,
              returns: true,
              remarks: true,
              paymentEntries: true,
            },
          },
        },
      }),
      prisma.adaptPurchaseHistory.findMany({
        where: { OR: adaptOr },
        select: {
          id: true,
          contactId: true,
          salesInvoiceNo: true,
          salesInvoiceMasterId: true,
          adaptInvoiceKey: true,
          invoiceDate: true,
          ttlAmount: true,
          origin: true,
          locationName: true,
        },
      }),
      prisma.orderWaybill.findMany({
        where: { invoiceNumber: { in: refs } },
        select: {
          id: true,
          invoiceNumber: true,
          waybillNo: true,
          orderId: true,
        },
      }),
      prisma.physicalConsultation.findMany({
        where: { invoiceNumber: { in: refs } },
        select: {
          id: true,
          invoiceNumber: true,
          contactNumber: true,
          customerName: true,
          consultationDate: true,
        },
      }),
      prisma.bookNoteRow.findMany({
        where: { salesInvoice: { in: refs } },
        select: {
          id: true,
          salesInvoice: true,
          orderId: true,
          bookNoteDayId: true,
        },
      }),
    ])

  const contactIds = [...new Set(adaptRows.map((r) => r.contactId))]
  const orderIds = orders.map((o) => o.id)

  const report = {
    mode: apply ? "apply" : "dry-run",
    refCount: refs.length,
    refs,
    counts: {
      orders: orders.length,
      adaptPurchaseHistory: adaptRows.length,
      orderWaybills: waybills.length,
      physicalConsultations: consultations.length,
      bookNoteRows: bookNoteRows.length,
      distinctAdaptContacts: contactIds.length,
    },
    samples: {
      orders: summarize(orders, (o) => ({
        id: o.id,
        name: o.name,
        orderNumber: o.orderNumber,
        shopifyOrderId: o.shopifyOrderId,
        erpnextInvoiceId: o.erpnextInvoiceId,
        totalPrice: o.totalPrice?.toString?.() ?? String(o.totalPrice),
        stage: o.fulfillmentStage,
        location: o.companyLocation?.name ?? null,
        related: o._count,
      })),
      adapt: summarize(adaptRows, (r) => ({
        id: r.id,
        salesInvoiceNo: r.salesInvoiceNo,
        masterId: r.salesInvoiceMasterId,
        key: r.adaptInvoiceKey,
        date: r.invoiceDate?.toISOString?.() ?? null,
        amount: r.ttlAmount?.toString?.() ?? String(r.ttlAmount),
        origin: r.origin,
        location: r.locationName,
        contactId: r.contactId,
      })),
      waybills: summarize(waybills, (w) => w),
      consultations: summarize(consultations, (c) => c),
      bookNotes: summarize(bookNoteRows, (b) => b),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (!apply) {
    console.error("[purge] dry-run only — pass --apply to delete")
    return
  }

  const deleted = {
    adaptPurchaseHistory: 0,
    orderWaybills: 0,
    physicalConsultations: 0,
    bookNoteRows: 0,
    orders: 0,
  }

  await prisma.$transaction(async (tx) => {
    if (adaptRows.length) {
      const r = await tx.adaptPurchaseHistory.deleteMany({
        where: { id: { in: adaptRows.map((x) => x.id) } },
      })
      deleted.adaptPurchaseHistory = r.count
    }

    if (waybills.length) {
      const r = await tx.orderWaybill.deleteMany({
        where: { id: { in: waybills.map((x) => x.id) } },
      })
      deleted.orderWaybills = r.count
    }

    if (consultations.length) {
      const r = await tx.physicalConsultation.deleteMany({
        where: { id: { in: consultations.map((x) => x.id) } },
      })
      deleted.physicalConsultations = r.count
    }

    if (bookNoteRows.length) {
      const r = await tx.bookNoteRow.deleteMany({
        where: { id: { in: bookNoteRows.map((x) => x.id) } },
      })
      deleted.bookNoteRows = r.count
    }

    for (const id of orderIds) {
      await tx.order.delete({ where: { id } })
      deleted.orders += 1
    }
  })

  console.log(JSON.stringify({ deleted, contactIdsTouched: contactIds }, null, 2))
  console.error(
    "[purge] done. Recalc contact last-purchase if insight stamps look stale:",
  )
  console.error(
    "  node scripts/with-env.mjs vault node scripts/recalc-contact-last-purchase.cjs ...",
  )
}

main()
  .catch((err) => {
    console.error("[purge] fatal", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
