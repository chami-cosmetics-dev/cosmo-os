import { z } from "zod";

import { matchCitypakAccount } from "@/lib/citypak-api";
import { LIMITS, trimmedString } from "@/lib/validation";

export type CitypakDispatchAccount = {
  accountId: string;
  apiToken: string;
  accountDbId: string | null;
  locationId: string | null;
  source: "location" | "prefix";
};

export const locationCitypakFieldsSchema = z.object({
  citypakAccountId: z
    .union([trimmedString(1, LIMITS.citypakAccountId.max), z.literal("")])
    .optional()
    .nullable(),
  citypakApiToken: z.string().trim().max(LIMITS.citypakApiToken.max).optional(),
});

export function maskCitypakApiToken(token: string) {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

export function publicCitypakLocationFields(row: {
  citypakAccountId: string | null;
  citypakApiToken: string | null;
}) {
  const token = row.citypakApiToken?.trim() ?? "";
  return {
    citypakAccountId: row.citypakAccountId?.trim() || null,
    hasCitypakApiToken: token.length > 0,
    citypakApiTokenMasked: token ? maskCitypakApiToken(token) : "",
  };
}

export function nextCitypakLocationCredentials(input: {
  existingAccountId: string | null;
  existingToken: string | null;
  accountId?: string | null;
  apiToken?: string;
}): { ok: true; accountId: string | null; apiToken: string | null } | { ok: false; error: string } {
  const accountProvided = input.accountId !== undefined;
  const tokenProvided = Boolean(input.apiToken?.trim());
  if (!accountProvided && !tokenProvided) {
    return {
      ok: true,
      accountId: input.existingAccountId,
      apiToken: input.existingToken,
    };
  }

  const nextAccountId = accountProvided
    ? (input.accountId ?? "").trim()
    : (input.existingAccountId ?? "").trim();
  if (!nextAccountId) {
    return { ok: true, accountId: null, apiToken: null };
  }

  const nextToken = tokenProvided ? input.apiToken!.trim() : (input.existingToken ?? "").trim();
  if (!nextToken) {
    return { ok: false, error: "CityPak API key is required with an account ID" };
  }
  if (nextToken.length < LIMITS.citypakApiToken.min) {
    return { ok: false, error: "CityPak API key is too short" };
  }

  return { ok: true, accountId: nextAccountId, apiToken: nextToken };
}

export function pickCitypakDispatchAccount(input: {
  location: {
    id: string;
    citypakAccountId: string | null;
    citypakApiToken: string | null;
  } | null;
  prefixAccounts: Array<{ id: string; accountId: string; apiToken: string; invoicePrefix: string }>;
  orderPrefix: string;
}): CitypakDispatchAccount | null {
  const locationAccountId = input.location?.citypakAccountId?.trim() ?? "";
  const locationToken = input.location?.citypakApiToken?.trim() ?? "";
  if (input.location && locationAccountId && locationToken) {
    return {
      accountId: locationAccountId,
      apiToken: locationToken,
      accountDbId: null,
      locationId: input.location.id,
      source: "location",
    };
  }

  const matched = matchCitypakAccount(input.prefixAccounts, input.orderPrefix);
  if (!matched?.apiToken) return null;
  return {
    accountId: matched.accountId,
    apiToken: matched.apiToken,
    accountDbId: matched.id,
    locationId: null,
    source: "prefix",
  };
}

