import { describe, expect, it } from "vitest";

import {
  canEditRequest,
  canExportScope,
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
const supervisor = viewerFromPermissions({
  userId: "u5",
  roleNames: ["supervisor"],
  permissionKeys: ["stock_requests.read_all"],
});
const lead = viewerFromPermissions({
  userId: "u1",
  roleNames: ["lead"],
  permissionKeys: ["stock_requests.create", "stock_requests.read_all"],
});

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

  it("lets manage export Website and My requests, not All staff", () => {
    const manager = viewerFromPermissions({
      userId: "u4",
      roleNames: [],
      permissionKeys: ["stock_requests.read", "stock_requests.manage"],
    });
    const merchantManager = viewerFromPermissions({
      userId: "u1",
      roleNames: ["Merchant 01"],
      permissionKeys: ["stock_requests.create", "stock_requests.manage"],
    });
    expect(canExportScope(callCentre, "web")).toBe(false);
    expect(canExportScope(merchant, "mine")).toBe(false);
    expect(canExportScope(manager, "web")).toBe(true);
    expect(canExportScope(manager, "mine")).toBe(false);
    expect(canExportScope(merchantManager, "mine")).toBe(true);
    expect(canExportScope(merchantManager, "web")).toBe(false);
    expect(canExportScope(admin, "web")).toBe(true);
    expect(canExportScope(admin, "mine")).toBe(true);
    expect(canExportScope(admin, "staff")).toBe(false);
  });

  it("gives read_all its own tab of every staff request, and keeps admins on My requests", () => {
    expect(canViewScope(supervisor, "staff")).toBe(true);
    expect(canViewScope(supervisor, "mine")).toBe(false);
    expect(canViewScope(supervisor, "web")).toBe(false);
    expect(canViewScope(merchant, "staff")).toBe(false);
    expect(canViewScope(admin, "staff")).toBe(false);
    expect(canViewScope(lead, "staff")).toBe(true);
    expect(scopeFilter(supervisor, "staff")).toEqual({ source: "staff" });
    expect(scopeFilter(lead, "mine")).toEqual({ source: "staff", createdById: "u1" });
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

  it("lets read_all see every staff request without editing them", () => {
    expect(canViewRequest(supervisor, mine)).toBe(true);
    expect(canViewRequest(supervisor, someoneElses)).toBe(true);
    expect(canViewRequest(supervisor, web)).toBe(false);
    expect(canEditRequest(supervisor, mine)).toBe(false);
    expect(canEditRequest(supervisor, someoneElses)).toBe(false);
    expect(canEditRequest(lead, mine)).toBe(true);
    expect(canEditRequest(lead, someoneElses)).toBe(false);
  });

  it("lets admins do everything", () => {
    for (const row of [web, imported, mine, someoneElses]) {
      expect(canViewRequest(admin, row)).toBe(true);
      expect(canEditRequest(admin, row)).toBe(true);
    }
  });
});
