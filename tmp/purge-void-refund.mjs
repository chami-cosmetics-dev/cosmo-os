/**
 * Remove voided/refunded AdaptPurchaseHistory rows.
 *
 *   node scripts/with-env.mjs vault node tmp/purge-void-refund.mjs
 *   node scripts/with-env.mjs vault node tmp/purge-void-refund.mjs --apply
 *   node scripts/with-env.mjs cosmo-prod node tmp/purge-void-refund.mjs --apply
 */
import { PrismaClient } from "@prisma/client"

const apply = process.argv.includes("--apply")
const rawUrl = process.env.DATABASE_URL ?? ""
const p = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
})

const VOID_REFUND = ["voided", "void", "refunded", "refund"]

async function main() {
  const companies = await p.company.findMany({ select: { id: true, name: true } })
  const report = []

  for (const company of companies) {
    const where = {
      companyId: company.id,
      OR: VOID_REFUND.map((status) => ({
        financialStatus: { equals: status, mode: "insensitive" },
      })),
    }

    const byStatus = await p.adaptPurchaseHistory.groupBy({
      by: ["financialStatus", "origin"],
      where,
      _count: true,
    })
    const rows = await p.adaptPurchaseHistory.findMany({
      where,
      select: {
        id: true,
        contactId: true,
        salesInvoiceNo: true,
        financialStatus: true,
        origin: true,
      },
    })
    const contactIds = [...new Set(rows.map((r) => r.contactId))]

    let deleted = 0
    let lastPurchaseUpdated = 0
    if (apply && rows.length > 0) {
      const result = await p.adaptPurchaseHistory.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      })
      deleted = result.count

      // Move lastPurchaseAt to newest remaining sale (exclude void/refund leftovers).
      for (let i = 0; i < contactIds.length; i += 50) {
        const chunk = contactIds.slice(i, i + 50)
        for (const contactId of chunk) {
          const latest = await p.adaptPurchaseHistory.findFirst({
            where: {
              companyId: company.id,
              contactId,
              OR: [
                { financialStatus: null },
                {
                  NOT: {
                    OR: VOID_REFUND.map((status) => ({
                      financialStatus: { equals: status, mode: "insensitive" },
                    })),
                  },
                },
              ],
            },
            orderBy: { invoiceDate: "desc" },
            select: { invoiceDate: true },
          })
          await p.contactMaster.update({
            where: { id: contactId },
            data: { lastPurchaseAt: latest?.invoiceDate ?? null },
          })
          lastPurchaseUpdated += 1
        }
      }
    }

    report.push({
      company: company.name,
      mode: apply ? "apply" : "dry-run",
      byStatus,
      rowCount: rows.length,
      contactsTouched: contactIds.length,
      deleted,
      lastPurchaseUpdated,
      sampleInvoices: rows.slice(0, 20).map((r) => ({
        invoice: r.salesInvoiceNo,
        status: r.financialStatus,
        origin: r.origin,
      })),
    })
  }

  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await p.$disconnect()
  })
