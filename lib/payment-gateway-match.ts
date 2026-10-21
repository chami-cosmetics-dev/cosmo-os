import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

/** Letters and digits only. "Mint Pay", "mint-pay", and "MintPay" all become "mintpay". */
export function compactPaymentGateway(gateway: string | null | undefined): string {
  return (gateway ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isMintpayGateway(gateway: string | null | undefined): boolean {
  return compactPaymentGateway(gateway).includes("mintpay");
}

export function isKokoGateway(gateway: string | null | undefined): boolean {
  return compactPaymentGateway(gateway).includes("koko");
}

/**
 * ERP Mode of Payment name.
 * Supplement (Vault OS) uses "Mintpay". Cosmetics.lk (Cosmo OS) uses "MintPay".
 * A blank or supplement-shaped value on Cosmo is rewritten to the cosmetics name.
 */
export function resolveMintpayMopName(
  stored: string | null | undefined,
  options?: { vaultOs?: boolean; envValue?: string | null },
): string {
  const vault = options?.vaultOs ?? isVaultOsDeployment();
  const envValue =
    options && "envValue" in options
      ? options.envValue
      : process.env.ERPNEXT_MINTPAY_MOP;
  const value = stored?.trim() || envValue?.trim() || "";
  if (!vault && compactPaymentGateway(value) === "mintpay") return "MintPay";
  if (!vault && !value) return "MintPay";
  return value || "Mintpay";
}

/**
 * ERP Mode of Payment name for bank transfer.
 * Cosmetics.lk (Cosmo OS) defaults to "Wire Transfer".
 * Vault OS uses "Bank Transfer" for every bank-transfer order — Vault Wire Transfer
 * has no company accounts, so Payment Entries must not use that name.
 * Stored or env "Wire Transfer" on Vault is rewritten to "Bank Transfer".
 */
export function resolveBankTransferMopName(
  stored: string | null | undefined,
  options?: { vaultOs?: boolean; envValue?: string | null },
): string {
  const vault = options?.vaultOs ?? isVaultOsDeployment();
  const envValue =
    options && "envValue" in options
      ? options.envValue
      : process.env.ERPNEXT_BANK_TRANSFER_MOP;
  const value = stored?.trim() || envValue?.trim() || "";
  if (vault && (!value || compactPaymentGateway(value) === "wiretransfer")) {
    return "Bank Transfer";
  }
  return value || "Wire Transfer";
}
