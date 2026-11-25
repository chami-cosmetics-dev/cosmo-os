import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"

config({ path: ".env.cosmo-prod", override: true })

const prisma = new PrismaClient()
const COMPANY = "cmn2xcas1002crl5xtgoq28f5"
const brand = "Palmers"

async function main() {
  const nimeshaContacts = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY,
      OR: [
        { assignedMerchant: { equals: "Nimesha", mode: "insensitive" } },
        { assignedMerchant: { equals: "MER101", mode: "insensitive" } },
        { assignedMerchant: { equals: "MER101-Nimesha", mode: "insensitive" } },
        { assignedMerchant: { equals: "Nimesha Madushani", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      assignedMerchant: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  })
  console.log("nimesha_allocated", nimeshaContacts.length)

  // Cosmo orders matching Palmers
  const orderCount = await prisma.order.count({
    where: {
      companyId: COMPANY,
      lineItems: {
        some: {
          OR: [
            {
              productItem: {
                vendor: { name: { equals: brand, mode: "insensitive" } },
              },
            },
            {
              productItem: {
                productTitle: { contains: brand, mode: "insensitive" },
              },
            },
          ],
        },
      },
    },
  })
  console.log("cosmo_palmers_orders", orderCount)

  // Sample: match Nimesha contacts to Palmers orders by phone/email (paged)
  const phoneToContact = new Map<string, string>()
  const emailToContact = new Map<string, string>()
  for (const c of nimeshaContacts) {
    const phones = [c.phoneNumber, ...c.phones.map((p) => p.phoneNumber)].filter(
      Boolean
    ) as string[]
    for (const p of phones) {
      const digits = p.replace(/\D/g, "")
      const last9 = digits.slice(-9)
      if (last9.length >= 9) phoneToContact.set(last9, c.id)
      phoneToContact.set(p.trim(), c.id)
    }
    const emails = [c.email, ...c.emails.map((e) => e.email)].filter(Boolean) as string[]
    for (const e of emails) emailToContact.set(e.trim().toLowerCase(), c.id)
  }

  const matched = new Set<string>()
  let cursor: string | undefined
  let pages = 0
  for (;;) {
    const page = await prisma.order.findMany({
      where: {
        companyId: COMPANY,
        lineItems: {
          some: {
            OR: [
              {
                productItem: {
                  vendor: { name: { equals: brand, mode: "insensitive" } },
                },
              },
              {
                productItem: {
                  productTitle: { contains: brand, mode: "insensitive" },
                },
              },
            ],
          },
        },
      },
      select: {
        id: true,
        customerPhone: true,
        customerEmail: true,
        lineItems: {
          select: {
            productItem: {
              select: {
                productTitle: true,
                vendor: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (page.length === 0) break
    pages++
    for (const o of page) {
      // whole-word-ish: vendor equals or title contains Palmers
      const has = o.lineItems.some((li) => {
        const v = li.productItem.vendor?.name?.toLowerCase() ?? ""
        const t = li.productItem.productTitle?.toLowerCase() ?? ""
        return v === "palmers" || t.includes("palmers")
      })
      if (!has) continue
      const phone = o.customerPhone?.trim()
      if (phone) {
        const digits = phone.replace(/\D/g, "")
        const last9 = digits.slice(-9)
        const id =
          phoneToContact.get(phone) ??
          (last9.length >= 9 ? phoneToContact.get(last9) : undefined)
        if (id) matched.add(id)
      }
      const email = o.customerEmail?.trim().toLowerCase()
      if (email && emailToContact.has(email)) matched.add(emailToContact.get(email)!)
    }
    cursor = page[page.length - 1]!.id
    if (page.length < 500) break
    if (pages % 20 === 0) console.log("pages", pages, "matched_so_far", matched.size)
  }

  // Also: contacts with assignedMerchant Nimesha who appear in Adapt with Palmers in lineItems JSON — sample count via raw if needed
  console.log(
    JSON.stringify(
      {
        cosmoOrderPages: pages,
        nimeshaPalmersViaCosmoOrders: matched.size,
        sampleIds: [...matched].slice(0, 10),
      },
      null,
      2
    )
  )

  // Direct: among Nimesha contacts, how many have purchase history linked?
  // Simpler check — AdaptPurchaseHistory by contactId
  const adaptHitIds = new Set<string>()
  const idChunks: string[][] = []
  for (let i = 0; i < nimeshaContacts.length; i += 500) {
    idChunks.push(nimeshaContacts.slice(i, i + 500).map((c) => c.id))
  }
  for (const chunk of idChunks) {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId: COMPANY, contactId: { in: chunk } },
      select: { contactId: true, lineItems: true },
    })
    for (const row of rows) {
      if (!row.contactId) continue
      const items = Array.isArray(row.lineItems) ? row.lineItems : []
      const hit = items.some((item) => {
        if (!item || typeof item !== "object") return false
        const obj = item as Record<string, unknown>
        const brandFields = [obj.brand, obj.Brand, obj.vendor, obj.Vendor, obj.itemBrand]
        if (
          brandFields.some(
            (b) => typeof b === "string" && b.toLowerCase().includes("palmers")
          )
        ) {
          return true
        }
        const name = String(obj.itemName ?? obj.productTitle ?? obj.name ?? "")
        return /palmers/i.test(name)
      })
      if (hit) adaptHitIds.add(row.contactId)
    }
  }

  const union = new Set([...matched, ...adaptHitIds])
  console.log(
    JSON.stringify(
      {
        nimeshaPalmersViaAdapt: adaptHitIds.size,
        nimeshaPalmersUnionCosmoOrAdapt: union.size,
      },
      null,
      2
    )
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
