import { describe, expect, it } from "vitest";

import {
  canAccessMerchantDashboard,
  hasMerchantDashboardAdminView,
  isCompanyAdminRole,
  isMerchantRoleName,
  userHasMerchantRole,
} from "@/lib/merchant-role";

describe("isMerchantRoleName", () => {
  it("matches Merchant 01 / merchant02 / merchant-level-02 style names", () => {
    expect(isMerchantRoleName("Merchant 01")).toBe(true);
    expect(isMerchantRoleName("merchant 02")).toBe(true);
    expect(isMerchantRoleName("merchant01")).toBe(true);
    expect(isMerchantRoleName("MERCHANT 9")).toBe(true);
    expect(isMerchantRoleName("merchant-level-02")).toBe(true);
    expect(isMerchantRoleName("merchant-level-01")).toBe(true);
    expect(isMerchantRoleName("merchant_level_01")).toBe(true);
    expect(isMerchantRoleName("Merchant Level 2")).toBe(true);
  });

  it("rejects non-merchant roles", () => {
    expect(isMerchantRoleName("merchant")).toBe(false);
    expect(isMerchantRoleName("manager")).toBe(false);
    expect(isMerchantRoleName("admin")).toBe(false);
    expect(isMerchantRoleName("merchant lead")).toBe(false);
    expect(isMerchantRoleName("merchant-level")).toBe(false);
    expect(isMerchantRoleName("")).toBe(false);
  });
});

describe("userHasMerchantRole / admin / access", () => {
  it("detects merchant among roles", () => {
    expect(userHasMerchantRole(["viewer", "Merchant 01"])).toBe(true);
    expect(userHasMerchantRole(["manager"])).toBe(false);
  });

  it("detects company admins", () => {
    expect(isCompanyAdminRole(["admin"])).toBe(true);
    expect(isCompanyAdminRole(["super_admin"])).toBe(true);
    expect(isCompanyAdminRole(["manager"])).toBe(false);
  });

  it("allows merchant dashboard for admins only (not merchant-level users)", () => {
    expect(canAccessMerchantDashboard(["Merchant 02"])).toBe(false);
    expect(canAccessMerchantDashboard(["merchant-level-01"])).toBe(false);
    expect(canAccessMerchantDashboard(["admin"])).toBe(true);
    expect(canAccessMerchantDashboard(["viewer"])).toBe(false);
  });

  it("grants merchant admin view via permission", () => {
    expect(
      hasMerchantDashboardAdminView({
        roleNames: ["manager"],
        permissionKeys: ["dashboard.merchant_admin_view"],
      })
    ).toBe(true);
    expect(
      hasMerchantDashboardAdminView({
        roleNames: ["manager"],
        permissionKeys: ["dashboard.merchant_view"],
      })
    ).toBe(false);
  });
});
