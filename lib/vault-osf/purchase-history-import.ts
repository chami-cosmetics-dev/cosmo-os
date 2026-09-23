import { prisma } from "@/lib/prisma";
import {
  isVaultOsfPurchaseHistoryMonth,
  parseDilhanPurchaseHistorySheet,
} from "@/lib/vault-osf/purchase-history-parse";

export {
  VAULT_OSF_PURCHASE_HISTORY_MONTHS,
  isVaultOsfPurchaseHistoryMonth,
  parseDilhanPurchaseHistorySheet,
  type ParsedPurchaseHistoryLine,
  type PurchaseHistoryParseResult,
  type VaultOsfPurchaseHistoryMonth,
} from "@/lib/vault-osf/purchase-history-parse";

export type PurchaseHistoryImportResult = {
  inserted: number;
  skippedBlank: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
  monthsPresent: string[];
  osfMonths: string[];
};

/** Replace company purchase-history lines with parsed Excel (one-time fill). */
export async function importVaultPurchaseHistory(params: {
  companyId: string;
  buffer: Buffer;
  filename: string;
}): Promise<PurchaseHistoryImportResult> {
  const parsed = parseDilhanPurchaseHistorySheet(params.buffer, params.filename);
  const monthsPresent = [
    ...new Set(parsed.lines.map((l) => l.postingDate.slice(0, 7))),
  ].sort();
  const osfMonths = monthsPresent.filter(isVaultOsfPurchaseHistoryMonth);

  await prisma.$transaction(async (tx) => {
    await tx.osfPurchaseHistoryLine.deleteMany({ where: { companyId: params.companyId } });
    if (parsed.lines.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < parsed.lines.length; i += CHUNK) {
      const chunk = parsed.lines.slice(i, i + CHUNK);
      await tx.osfPurchaseHistoryLine.createMany({
        data: chunk.map((l) => ({
          companyId: params.companyId,
          sku: l.sku,
          supplier: l.supplier,
          postingDate: l.postingDate,
          qty: l.qty,
          rate: l.rate,
          netValue: l.netValue,
          excelCompany: l.excelCompany,
          sourceRef: l.sourceRef,
        })),
      });
    }
  });

  return {
    inserted: parsed.lines.length,
    skippedBlank: parsed.skippedBlank,
    errors: parsed.errors,
    monthsPresent,
    osfMonths,
  };
}
