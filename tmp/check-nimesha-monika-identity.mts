import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"

config({ path: ".env.cosmo-prod", override: true })

const prisma = new PrismaClient()

function normalizeMerCodeKey(code: string | null | undefined): string | null {
  const raw = String(code ?? "").trim()
  if (!raw) return null
  const m = raw.match(/^MER\s*(\d+)/i)
  if (!m) return null
  return `MER${m[1]}`
}

function merMatchKeysFromCouponCodes(couponCodes: string[] | null | undefined) {
  const out = new Set<string>()
  for (const code of couponCodes ?? []) {
    const trimmed = String(code ?? "").trim()
    if (!trimmed) continue
    out.add(trimmed)
    const key = normalizeMerCodeKey(trimmed)
    if (key) out.add(key)
  }
  return [...out]
}

function matchKeys(u: {
  knownName: string | null
  name: string | null
  email: string | null
  couponCodes: string[]
}) {
  const labels = [u.knownName, u.name, u.email]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of [...labels, ...merMatchKeysFromCouponCodes(u.couponCodes)]) {
    const k = key.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(key)
  }
  return out
}

async function countForKeys(companyId: string, keys: string[]) {
  if (keys.length === 0) return 0
  return prisma.contactMaster.count({
    where: {
      companyId,
      OR: keys.map((label) => ({
        assignedMerchant: { equals: label, mode: "insensitive" as const },
      })),
    },
  })
}

async function main() {
  const companyId = "cmn2xcas1002crl5xtgoq28f5"
  const users = await prisma.user.findMany({
    where: {
      companyId,
      OR: [
        { knownName: { contains: "Nimesha", mode: "insensitive" } },
        { knownName: { contains: "Monika", mode: "insensitive" } },
        { email: { contains: "maharagama", mode: "insensitive" } },
        { email: { contains: "monika", mode: "insensitive" } },
        { couponCodes: { has: "MER121" } },
        { couponCodes: { has: "MER101" } },
      ],
    },
    select: {
      id: true,
      knownName: true,
      name: true,
      email: true,
      couponCodes: true,
      auth0Id: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  })

  for (const u of users) {
    const keys = matchKeys(u)
    const count = await countForKeys(companyId, keys)
    console.log(
      JSON.stringify(
        {
          knownName: u.knownName,
          email: u.email,
          couponCodes: u.couponCodes,
          auth0Id: u.auth0Id,
          roleNames: u.userRoles.map((r) => r.role.name),
          matchKeys: keys,
          allocatedCountWithThoseKeys: count,
        },
        null,
        2
      )
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
