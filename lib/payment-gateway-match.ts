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
