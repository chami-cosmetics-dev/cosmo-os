import { describe, expect, it } from "vitest";

import {
  isStoreRoleName,
  resolvePostLoginPath,
  userHasPurchasingHome,
  userHasStoreRole,
} from "@/lib/post-login-path";

describe("isStoreRoleName / userHasStoreRole", () => {
  it("matches stores-level and store numbered roles", () => {
    expect(isStoreRoleName("stores-level-01")).toBe(true);
    expect(isStoreRoleName("stores-level-02")).toBe(true);
    expect(isStoreRoleName("store-level-01")).toBe(true);
    expect(isStoreRoleName("Stores 01")).toBe(true);
    expect(isStoreRoleName("warehouse")).toBe(true);
    expect(isStoreRoleName("store")).toBe(true);
  });

  it("rejects non-store roles", () => {
    expect(isStoreRoleName("manager")).toBe(false);
    expect(isStoreRoleName("merchant-level-01")).toBe(false);
    expect(isStoreRoleName("purchasing")).toBe(false);
    expect(isStoreRoleName("")).toBe(false);
  });

  it("detects store among roles", () => {
    expect(userHasStoreRole(["viewer", "stores-level-01"])).toBe(true);
    expect(userHasStoreRole(["manager"])).toBe(false);
  });
});

describe("userHasPurchasingHome", () => {
  it("matches purchasing role names or OSF permissions", () => {
    expect(userHasPurchasingHome(["purchasing"], [])).toBe(true);
    expect(userHasPurchasingHome(["Purchase Team"], [])).toBe(true);
    expect(userHasPurchasingHome([], ["purchasing.osf.read"])).toBe(true);
    expect(userHasPurchasingHome([], ["purchasing.osf.manage"])).toBe(true);
    expect(userHasPurchasingHome([], ["purchasing.item_trends.read"])).toBe(false);
  });
});

describe("resolvePostLoginPath", () => {
  it("keeps ops/admin roles on overview dashboard", () => {
    expect(resolvePostLoginPath({ roleNames: ["admin"] })).toBe("/dashboard");
    expect(resolvePostLoginPath({ roleNames: ["manager"] })).toBe("/dashboard");
    expect(
      resolvePostLoginPath({
        roleNames: ["manager"],
        permissionKeys: ["purchasing.osf.read"],
      })
    ).toBe("/dashboard");
  });

  it("sends merchants to merchant dashboard", () => {
    expect(resolvePostLoginPath({ roleNames: ["merchant-level-01"] })).toBe(
      "/dashboard/merchant"
    );
  });

  it("sends store roles to fulfillment", () => {
    expect(resolvePostLoginPath({ roleNames: ["stores-level-01"] })).toBe(
      "/dashboard/fulfillment"
    );
  });

  it("sends purchasing users to Order Support File", () => {
    expect(resolvePostLoginPath({ roleNames: ["purchasing"] })).toBe(
      "/dashboard/purchasing/osf"
    );
    expect(
      resolvePostLoginPath({
        roleNames: ["custom-buyer"],
        permissionKeys: ["purchasing.osf.read"],
      })
    ).toBe("/dashboard/purchasing/osf");
  });

  it("prefers merchant over store/purchasing when combined", () => {
    expect(
      resolvePostLoginPath({
        roleNames: ["merchant-level-01", "stores-level-01"],
        permissionKeys: ["purchasing.osf.read"],
      })
    ).toBe("/dashboard/merchant");
  });

  it("defaults to overview", () => {
    expect(resolvePostLoginPath({ roleNames: ["seo_team"] })).toBe("/dashboard");
    expect(resolvePostLoginPath({ roleNames: [] })).toBe("/dashboard");
  });
});
