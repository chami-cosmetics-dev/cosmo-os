import { describe, expect, it } from "vitest";

import {
  ALL_OSF_COLUMN_GROUPS,
  normalizeOptionalColumnGroups,
} from "@/lib/osf/column-groups";
import {
  hasFullOsfColumnAccess,
  resolveEffectiveOsfColumnGroupsFromMarks,
} from "@/lib/osf/column-visibility";

function ctx(perms: string[]) {
  return {
    user: { id: "u1", companyId: "c1", email: "a@b.com", name: "Test" },
    permissionKeys: perms,
    roleNames: [] as string[],
    sessionUser: {},
  };
}

describe("hasFullOsfColumnAccess", () => {
  it("true for manage or permission", () => {
    expect(hasFullOsfColumnAccess(ctx(["purchasing.osf.manage"]))).toBe(true);
    expect(hasFullOsfColumnAccess(ctx(["purchasing.osf.permission"]))).toBe(true);
  });

  it("false for read-only", () => {
    expect(hasFullOsfColumnAccess(ctx(["purchasing.osf.read"]))).toBe(false);
  });
});

describe("resolveEffectiveOsfColumnGroupsFromMarks", () => {
  it("full access returns all groups", () => {
    const groups = resolveEffectiveOsfColumnGroupsFromMarks([], true);
    expect([...groups].sort()).toEqual([...ALL_OSF_COLUMN_GROUPS].sort());
  });

  it("unmarked restricted user gets core only", () => {
    const groups = resolveEffectiveOsfColumnGroupsFromMarks([], false);
    expect([...groups]).toEqual(["core"]);
  });

  it("marked margins includes margins", () => {
    const groups = resolveEffectiveOsfColumnGroupsFromMarks(["margins"], false);
    expect(groups.has("core")).toBe(true);
    expect(groups.has("margins")).toBe(true);
    expect(groups.has("cost")).toBe(false);
  });

  it("ignores unknown group ids", () => {
    const groups = resolveEffectiveOsfColumnGroupsFromMarks(["bogus", "pricing"], false);
    expect(groups.has("pricing")).toBe(true);
    expect(groups.has("bogus" as never)).toBe(false);
  });
});

describe("normalizeOptionalColumnGroups", () => {
  it("dedupes and filters", () => {
    expect(normalizeOptionalColumnGroups(["margins", "margins", "nope", "cost"])).toEqual([
      "margins",
      "cost",
    ]);
  });
});
