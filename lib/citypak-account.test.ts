import { describe, expect, it } from "vitest";

import {
  maskCitypakApiToken,
  nextCitypakLocationCredentials,
  pickCitypakDispatchAccount,
  publicCitypakLocationFields,
} from "@/lib/citypak-account";

describe("pickCitypakDispatchAccount", () => {
  const prefixAccounts = [
    { id: "acc-600", accountId: "5218", apiToken: "token-600", invoicePrefix: "600" },
    { id: "acc-110", accountId: "13587", apiToken: "token-110", invoicePrefix: "110" },
  ];

  it("uses location credentials before prefix accounts", () => {
    const picked = pickCitypakDispatchAccount({
      location: {
        id: "loc-kad",
        citypakAccountId: "13717",
        citypakApiToken: "405-location-token",
      },
      prefixAccounts,
      orderPrefix: "140",
    });
    expect(picked).toEqual({
      accountId: "13717",
      apiToken: "405-location-token",
      accountDbId: null,
      locationId: "loc-kad",
      source: "location",
    });
  });

  it("falls back to saved prefix accounts for mapped companies", () => {
    const picked = pickCitypakDispatchAccount({
      location: { id: "loc-cosmo", citypakAccountId: null, citypakApiToken: null },
      prefixAccounts,
      orderPrefix: "6008123",
    });
    expect(picked).toEqual({
      accountId: "5218",
      apiToken: "token-600",
      accountDbId: "acc-600",
      locationId: null,
      source: "prefix",
    });
  });

  it("returns null when neither location nor prefix is configured", () => {
    expect(
      pickCitypakDispatchAccount({
        location: { id: "loc-new", citypakAccountId: "13717", citypakApiToken: null },
        prefixAccounts,
        orderPrefix: "140",
      })
    ).toBeNull();
  });
});

describe("nextCitypakLocationCredentials", () => {
  it("keeps existing values when fields are omitted", () => {
    expect(
      nextCitypakLocationCredentials({
        existingAccountId: "13717",
        existingToken: "saved-token",
      })
    ).toEqual({ ok: true, accountId: "13717", apiToken: "saved-token" });
  });

  it("clears both when account ID is blank", () => {
    expect(
      nextCitypakLocationCredentials({
        existingAccountId: "13717",
        existingToken: "saved-token",
        accountId: "",
      })
    ).toEqual({ ok: true, accountId: null, apiToken: null });
  });

  it("requires an API key with a new account ID", () => {
    expect(
      nextCitypakLocationCredentials({
        existingAccountId: null,
        existingToken: null,
        accountId: "13719",
      })
    ).toEqual({ ok: false, error: "CityPak API key is required with an account ID" });
  });

  it("saves account ID and API key together", () => {
    expect(
      nextCitypakLocationCredentials({
        existingAccountId: null,
        existingToken: null,
        accountId: "13719",
        apiToken: "406-new-token",
      })
    ).toEqual({ ok: true, accountId: "13719", apiToken: "406-new-token" });
  });
});

describe("publicCitypakLocationFields", () => {
  it("masks the token and never returns it", () => {
    expect(
      publicCitypakLocationFields({
        citypakAccountId: "13717",
        citypakApiToken: "405-e4b584fe-03c9-46bb-845b-b9afd61c37ea",
      })
    ).toEqual({
      citypakAccountId: "13717",
      hasCitypakApiToken: true,
      citypakApiTokenMasked: maskCitypakApiToken("405-e4b584fe-03c9-46bb-845b-b9afd61c37ea"),
    });
  });
});
