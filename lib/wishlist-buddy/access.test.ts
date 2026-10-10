import { describe, expect, it } from "vitest";

import {
  canEditRequest,
  canViewRequest,
  canViewScope,
  scopeFilter,
  viewerFromPermissions,
} from "./access";

const merchant = viewerFromPermissions({ userId: "u1", roleNames: ["Merchant 01"], permissionKeys: ["stock_requests.create"] });
const callCentre = viewerFromPermissions({ userId: "u2", roleNames: ["call centre"], permissionKeys: ["stock_requests.read"] });
const both = viewerFromPermissions({
  userId: "u3",
  roleNames: ["Merchant 02"],
  permissionKeys: ["stock_requests.read", "stock_requests.create"],
});
const admin = viewerFromPermissions({ userId: "u9", roleNames: ["admin"], permissionKeys: [] });

const web = { source: "shopify", createdById: null };
const imported = { source: "import", createdById: null };
const mine = { source: "staff", createdById: "u1" };
const someoneElses = { source: "staff", createdById: "u3" };

describe("tabs", () => {
  it("shows each tab only with its permission; admins and dual-permission users see both", () => {
    expect([canViewScope(merchant, "web"), canViewScope(merchant, "mine")]).toEqual([false, true]);
    expect([canViewScope(callCentre, "web"), canViewScope(callCentre, "mine")]).toEqual([true, false]);
    expect([canViewScope(both, "web"), canViewScope(both, "mine")]).toEqual([true, true]);
    expect([canViewScope(admin, "web"), canViewScope(admin, "mine")]).toEqual([true, true]);
  });

  it("filters My requests to the creator, except for admins", () => {
    expect(scopeFilter(merchant, "mine")).toEqual({ source: "staff", createdById: "u1" });
    expect(scopeFilter(admin, "mine")).toEqual({ source: "staff" });
    expect(scopeFilter(callCentre, "web")).toEqual({ source: { in: ["shopify", "import"] } });
  });
});

describe("viewing and editing single requests", () => {
  it("lets creators see and edit only their own staff requests", () => {
    expect(canViewRequest(merchant, mine)).toBe(true);
    expect(canEditRequest(merchant, mine)).toBe(true);
    expect(canViewRequest(merchant, someoneElses)).toBe(false);
    expect(canEditRequest(merchant, someoneElses)).toBe(false);
    expect(canViewRequest(merchant, web)).toBe(false);
  });

  it("needs read to see and manage to edit website/imported requests", () => {
    expect(canViewRequest(callCentre, web)).toBe(true);
    expect(canViewRequest(callCentre, imported)).toBe(true);
    expect(canEditRequest(callCentre, web)).toBe(false);
    expect(canViewRequest(callCentre, mine)).toBe(false);
    const manager = viewerFromPermissions({
      userId: "u4",
      roleNames: [],
      permissionKeys: ["stock_requests.read", "stock_requests.manage"],
    });
    expect(canEditRequest(manager, web)).toBe(true);
  });

  it("lets admins do everything", () => {
    for (const row of [web, imported, mine, someoneElses]) {
      expect(canViewRequest(admin, row)).toBe(true);
      expect(canEditRequest(admin, row)).toBe(true);
    }
  });
});
