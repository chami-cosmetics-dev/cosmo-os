import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CompanyLocationInvoiceFields = {
  id: string;
  manualInvoicePrefix: string | null;
  manualInvoiceNextSeq: number;
  manualInvoiceSeqPadding: number;
};

export async function getCompanyLocationInvoiceFields(
  ids: string[]
): Promise<Map<string, CompanyLocationInvoiceFields>> {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<CompanyLocationInvoiceFields[]>(Prisma.sql`
    SELECT
      "id",
      "manualInvoicePrefix",
      "manualInvoiceNextSeq",
      "manualInvoiceSeqPadding"
    FROM "CompanyLocation"
    WHERE "id" IN (${Prisma.join(ids)})
  `);

  return new Map(rows.map((row) => [row.id, row]));
}
