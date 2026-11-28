import { prisma } from "@/lib/prisma"
import {
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
  phoneDigitsOnly,
} from "@/lib/phone-lookup"
import type { AllocatedMerchantRosterMatch } from "@/lib/reports/allocated-merchant-format"
import {
  EMPTY_DUMP_CONTACT_CSV_FIELDS,
  formatDumpContactCsvFields,
  type DumpContactCsvFields,
} from "@/lib/reports/order-dump"

function phoneLookupKeys(raw: string | null | undefined): string[] {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return []
  const keys = new Set<string>()
  for (const variant of buildPhoneLookupVariants(trimmed)) {
    const key =
      canonicalPhoneForErpCustomerId(variant) ?? phoneDigitsOnly(variant) ?? variant
    if (key) keys.add(key)
  }
  return [...keys]
}

/**
 * Batch-load Contact Master last-purchase + allocated merchant by order phones.
 * Keys every phone variant so Cosmo dump rows resolve without per-row queries.
 */
export async function loadDumpContactFieldsByPhones(
  companyId: string,
  phones: Array<string | null | undefined>,
  aliasToRoster?: Map<string, AllocatedMerchantRosterMatch> | null,
): Promise<Map<string, DumpContactCsvFields>> {
  const out = new Map<string, DumpContactCsvFields>()
  const variants = new Set<string>()
  for (const phone of phones) {
    for (const variant of buildPhoneLookupVariants(String(phone ?? "").trim())) {
      if (variant) variants.add(variant)
    }
  }
  if (variants.size === 0) return out

  const variantList = [...variants]
  const contacts: Array<{
    phoneNumber: string | null
    lastPurchaseAt: Date | null
    assignedMerchant: string | null
    phones: Array<{ phoneNumber: string }>
  }> = []

  for (let i = 0; i < variantList.length; i += 400) {
    const chunk = variantList.slice(i, i + 400)
    const rows = await prisma.contactMaster.findMany({
      where: {
        companyId,
        OR: [
          { phoneNumber: { in: chunk } },
          { phones: { some: { phoneNumber: { in: chunk } } } },
        ],
      },
      select: {
        phoneNumber: true,
        lastPurchaseAt: true,
        assignedMerchant: true,
        phones: { select: { phoneNumber: true } },
      },
    })
    contacts.push(...rows)
  }

  for (const contact of contacts) {
    const fields = formatDumpContactCsvFields(contact, aliasToRoster)
    const linkPhones = [
      contact.phoneNumber,
      ...contact.phones.map((row) => row.phoneNumber),
    ]
    for (const raw of linkPhones) {
      for (const key of phoneLookupKeys(raw)) {
        if (!out.has(key)) out.set(key, fields)
      }
    }
  }

  return out
}

/** Resolve dump contact fields for one order phone from a batch map. */
export function dumpContactFieldsForPhone(
  byPhone: Map<string, DumpContactCsvFields>,
  phone: string | null | undefined,
): DumpContactCsvFields {
  for (const key of phoneLookupKeys(phone)) {
    const hit = byPhone.get(key)
    if (hit) return hit
  }
  return { ...EMPTY_DUMP_CONTACT_CSV_FIELDS }
}
