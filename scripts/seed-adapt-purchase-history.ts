/**
 * Seed one Adapt purchase history row for US1 UI validation.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-dev npx --yes tsx scripts/seed-adapt-purchase-history.ts --company-id <id> --contact-id <id>
 */

import { PrismaClient, Prisma } from "@prisma/client";

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const companyId = arg("company-id");
  const contactId = arg("contact-id");
  if (!companyId || !contactId) {
    console.error(
      "Usage: npx tsx scripts/seed-adapt-purchase-history.ts --company-id <id> --contact-id <id>"
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const contact = await prisma.contactMaster.findFirst({
      where: { id: contactId, companyId },
      select: { id: true },
    });
    if (!contact) {
      throw new Error("Contact not found for company");
    }

    const key = `mid:seed-adapt-${contactId.slice(-6)}`;
    const row = await prisma.adaptPurchaseHistory.upsert({
      where: {
        companyId_adaptInvoiceKey: { companyId, adaptInvoiceKey: key },
      },
      create: {
        companyId,
        contactId,
        adaptInvoiceKey: key,
        salesInvoiceMasterId: `seed-${contactId.slice(-6)}`,
        salesInvoiceNo: "ADAPT-SEED-001",
        invoiceDate: new Date("2024-06-15T00:00:00"),
        ttlAmount: new Prisma.Decimal("2500.00"),
        locationName: "Head Office- Pepiliyana",
        salesLocationId: "1",
        paymentMethod: "Cash on delivery",
        merchantKnownName: "Seed Merchant",
      },
      update: {
        ttlAmount: new Prisma.Decimal("2500.00"),
        locationName: "Head Office- Pepiliyana",
      },
    });

    console.log(JSON.stringify({ ok: true, id: row.id, adaptInvoiceKey: key }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
