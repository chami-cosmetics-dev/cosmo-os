import type { Prisma } from "@prisma/client";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

export const LEGACY_ACC_SINV_PREFIX = "ACC-SINV";

export function isLegacyAccSinvRef(value: string | null | undefined): boolean {
  return value?.trim().toUpperCase().startsWith(LEGACY_ACC_SINV_PREFIX) ?? false;
}

/** Excludes legacy ERP-native invoices from active fulfillment workflows. */
export const excludeLegacyAccSinvOrdersWhere = {
  NOT: {
    OR: [
      { name: { startsWith: LEGACY_ACC_SINV_PREFIX, mode: "insensitive" } },
      { erpnextInvoiceId: { startsWith: LEGACY_ACC_SINV_PREFIX, mode: "insensitive" } },
    ],
  },
} satisfies Prisma.OrderWhereInput;

/** ACC-SINV is legacy only in Vault; Cosmo may still use that ERP series. */
export function getLegacyAccSinvFulfillmentWhere(
  isVault = isVaultOsDeployment(),
): Prisma.OrderWhereInput {
  return isVault ? excludeLegacyAccSinvOrdersWhere : {};
}
