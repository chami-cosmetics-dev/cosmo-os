import { describe, expect, it } from "vitest";

import {
  isMintpayGateway,
  resolveMintpayMopName,
} from "@/lib/payment-gateway-match";

describe("isMintpayGateway", () => {
  it("matches cosmetics and supplement gateway labels", () => {
    expect(isMintpayGateway("Mint Pay")).toBe(true);
    expect(isMintpayGateway("MintPay")).toBe(true);
    expect(isMintpayGateway("mintpay")).toBe(true);
    expect(isMintpayGateway("mint-pay")).toBe(true);
    expect(isMintpayGateway("KOKO")).toBe(false);
    expect(isMintpayGateway("Bank Transfer")).toBe(false);
  });
});

describe("resolveMintpayMopName", () => {
  it("uses MintPay on Cosmo OS and Mintpay on Vault OS", () => {
    expect(resolveMintpayMopName(null, { vaultOs: false, envValue: null })).toBe("MintPay");
    expect(resolveMintpayMopName("Mintpay", { vaultOs: false, envValue: null })).toBe("MintPay");
    expect(resolveMintpayMopName(null, { vaultOs: true, envValue: null })).toBe("Mintpay");
    expect(resolveMintpayMopName("Mintpay", { vaultOs: true, envValue: null })).toBe("Mintpay");
  });
});
