import { describe, expect, it } from "vitest";

import {
  amountsMatch,
  getPaymentMethodLabel,
  getPriorityLabel,
  getRouteBadgeLabel,
  isCashFlowDelivery,
  isRenderableDelivery,
  requiresPaymentReference,
} from "@/src/utils/delivery";
import { formatMoney, parseMoney } from "@/src/utils/money";
import { buildPasswordResetUrl } from "@/src/utils/password-reset-url";
import {
  getActiveTenantIds,
  getPrimaryTenantSession,
  hasActiveSession,
  removeTenantFromSession,
  type RiderSession,
} from "@/src/storage/session-types";

describe("parseMoney / formatMoney", () => {
  it("parses valid amounts", () => {
    expect(parseMoney("1250.50")).toBe(1250.5);
    expect(parseMoney("0")).toBe(0);
  });

  it("falls back to 0 for invalid input", () => {
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney("abc")).toBe(0);
    expect(parseMoney(undefined)).toBe(0);
  });

  it("formats with Rs. prefix", () => {
    expect(formatMoney("1000")).toBe("Rs. 1,000.00");
    expect(formatMoney("1000", "LKR")).toBe("Rs. 1,000.00 LKR");
  });
});

describe("delivery helpers", () => {
  it("detects renderable deliveries", () => {
    expect(isRenderableDelivery({ id: "1", orderLabel: "SO-1", amount: "100" })).toBe(true);
    expect(isRenderableDelivery({ id: "", orderLabel: "SO-1", amount: "100" })).toBe(false);
  });

  it("maps route badge labels", () => {
    expect(getRouteBadgeLabel("accepted")).toBe("In transit");
    expect(getRouteBadgeLabel("arrived")).toBe("At stop");
    expect(getRouteBadgeLabel("assigned")).toBe("Next stop");
  });

  it("maps payment priority labels", () => {
    expect(getPriorityLabel({ expectedPaymentMethod: "cod" })).toBe("Cash on delivery");
    expect(getPriorityLabel({ expectedPaymentMethod: "already_paid" })).toBe("Prepared order");
    expect(
      getPriorityLabel({
        payment: {
          lines: [{ paymentMethod: "cod" }, { paymentMethod: "card" }],
        },
      })
    ).toBe("Split payment");
    expect(getPaymentMethodLabel("bank_transfer")).toBe("Bank Transfer");
  });

  it("checks cash flow and payment reference rules", () => {
    expect(isCashFlowDelivery({ expectedPaymentMethod: "cod" })).toBe(true);
    expect(isCashFlowDelivery({ expectedPaymentMethod: "card" })).toBe(false);
    expect(
      isCashFlowDelivery({
        payment: {
          paymentMethod: "card",
          lines: [{ paymentMethod: "cod" }, { paymentMethod: "card" }],
        },
      })
    ).toBe(true);
    expect(requiresPaymentReference("bank_transfer")).toBe(true);
    expect(requiresPaymentReference("card")).toBe(true);
    expect(requiresPaymentReference("cod")).toBe(false);
  });

  it("compares amounts with tolerance", () => {
    expect(amountsMatch("100.00", 100)).toBe(true);
    expect(amountsMatch("100.00", 100.005)).toBe(true);
    expect(amountsMatch("100.00", 99.5)).toBe(false);
  });
});

describe("session helpers", () => {
  const session: RiderSession = {
    tenants: {
      cosmetics: {
        accessToken: "tok-c",
        expiresAt: "2099-01-01T00:00:00.000Z",
        rider: { id: "u1", name: "Rider", email: "r@x.com", mobile: null },
      },
      vault: {
        accessToken: "tok-v",
        expiresAt: "2099-01-01T00:00:00.000Z",
        rider: { id: "u2", name: "Rider", email: "r@x.com", mobile: null },
      },
    },
  };

  it("detects active session and tenants", () => {
    expect(hasActiveSession(session)).toBe(true);
    expect(hasActiveSession(null)).toBe(false);
    expect(getActiveTenantIds(session)).toEqual(["cosmetics", "vault"]);
    expect(getPrimaryTenantSession(session)?.accessToken).toBe("tok-c");
  });

  it("removes a tenant and clears session when empty", () => {
    const withoutVault = removeTenantFromSession(session, "vault");
    expect(getActiveTenantIds(withoutVault)).toEqual(["cosmetics"]);
    expect(removeTenantFromSession(withoutVault!, "cosmetics")).toBeNull();
  });
});

describe("buildPasswordResetUrl", () => {
  it("builds auth login URL and strips trailing slash", () => {
    expect(buildPasswordResetUrl("https://os.cosmetics.lk")).toBe("https://os.cosmetics.lk/auth/login");
    expect(buildPasswordResetUrl("https://os.cosmetics.lk/")).toBe("https://os.cosmetics.lk/auth/login");
  });

  it("returns null when base is missing", () => {
    expect(buildPasswordResetUrl(null)).toBeNull();
    expect(buildPasswordResetUrl("")).toBeNull();
  });
});
