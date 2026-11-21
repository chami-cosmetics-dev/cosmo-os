import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"
import { writeFileSync } from "node:fs"

config({ path: ".env.cosmo-prod", override: true })

const prisma = new PrismaClient()
const companyId = "cmn2xcas1002crl5xtgoq28f5"

async function loadForLabels(labels: string[]) {
  return prisma.contactMaster.findMany({
    where: {
      companyId,
      OR: labels.map((label) => ({
        assignedMerchant: { equals: label, mode: "insensitive" as const },
      })),
    },
    select: {
      name: true,
      phoneNumber: true,
      assignedMerchant: true,
      purchaseTotalValue: true,
      phones: { select: { phoneNumber: true } },
    },
    orderBy: [{ purchaseTotalValue: "desc" }, { id: "asc" }],
  })
}

function phonesOf(c: {
  phoneNumber: string | null
  phones: { phoneNumber: string }[]
}) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of [c.phoneNumber, ...c.phones.map((x) => x.phoneNumber)]) {
    const t = (p ?? "").trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function toCsv(
  rows: Array<{
    name: string | null
    assignedMerchant: string | null
    purchaseTotalValue: unknown
    phoneNumber: string | null
    phones: { phoneNumber: string }[]
  }>
) {
  const lines = ["name,assignedMerchant,lifetime,phones"]
  for (const c of rows) {
    const name = JSON.stringify(c.name ?? "")
    const merchant = JSON.stringify(c.assignedMerchant ?? "")
    const lifetime = Number(c.purchaseTotalValue ?? 0)
    const phones = JSON.stringify(phonesOf(c).join(" | "))
    lines.push(`${name},${merchant},${lifetime},${phones}`)
  }
  return lines.join("\n") + "\n"
}

async function main() {
  const nimesha = await loadForLabels([
    "Nimesha",
    "Nimesha Madushani",
    "maharagamapos2@gmail.com",
    "MER101",
    "MER101-Nimesha",
  ])
  const monika = await loadForLabels([
    "Monika",
    "Monika Severinus",
    "monika.cosmetics@outlook.com",
    "MER121",
    "MER121-Monika",
  ])

  writeFileSync("tmp/nimesha-allocated.csv", toCsv(nimesha))
  writeFileSync("tmp/monika-allocated.csv", toCsv(monika))

  console.log("MONIKA_COUNT", monika.length)
  for (const c of monika) {
    console.log(
      `${phonesOf(c).join(" | ")}\t${c.name ?? ""}\t${c.assignedMerchant}`
    )
  }
  console.log("NIMESHA_COUNT", nimesha.length)
  console.log("Wrote tmp/monika-allocated.csv and tmp/nimesha-allocated.csv")
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
