import { describe, expect, it } from "vitest";

import {
  isMintpayGateway,
  resolveBankTransferMopName,
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

describe("resolveBankTransferMopName", () => {
  it("uses Wire Transfer on Cosmo OS and Bank Transfer on Vault OS", () => {
    expect(resolveBankTransferMopName(null, { vaultOs: false, envValue: null })).toBe("Wire Transfer");
    expect(resolveBankTransferMopName("Wire Transfer", { vaultOs: false, envValue: null })).toBe(
      "Wire Transfer",
    );
    expect(resolveBankTransferMopName("Bank Transfer", { vaultOs: false, envValue: null })).toBe(
      "Bank Transfer",
    );
    expect(resolveBankTransferMopName(null, { vaultOs: true, envValue: null })).toBe("Bank Transfer");
    expect(resolveBankTransferMopName("Wire Transfer", { vaultOs: true, envValue: null })).toBe(
      "Bank Transfer",
    );
    expect(resolveBankTransferMopName("wire_transfer", { vaultOs: true, envValue: null })).toBe(
      "Bank Transfer",
    );
    expect(resolveBankTransferMopName("Bank Transfer", { vaultOs: true, envValue: null })).toBe(
      "Bank Transfer",
    );
  });

  it("does not rewrite unrelated MOP names", () => {
    expect(resolveBankTransferMopName("Cash", { vaultOs: true, envValue: null })).toBe("Cash");
    expect(resolveBankTransferMopName("KOKO", { vaultOs: true, envValue: null })).toBe("KOKO");
  });
});
