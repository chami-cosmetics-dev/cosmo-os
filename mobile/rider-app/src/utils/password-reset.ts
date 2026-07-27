import { API_BASE_URL, COSMETICS_API_URL, VAULT_API_URL } from "@/src/env";
import { buildPasswordResetUrl } from "@/src/utils/password-reset-url";

/**
 * Prefer Cosmetics, then Vault, then the single-backend API URL.
 */
export function getPasswordResetUrl() {
  return buildPasswordResetUrl(COSMETICS_API_URL ?? VAULT_API_URL ?? API_BASE_URL);
}
