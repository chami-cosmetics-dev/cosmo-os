import { describe, expect, it } from "vitest";

import {
  CALL_CENTER_CATEGORY_COLORS,
  CALL_CENTER_CHART_EXCLUDED_CATEGORIES,
  CALL_CENTER_OUTCOME_VALUES,
  CALL_CENTER_UNCONTACTED_CATEGORY,
  callCenterCategoryColor,
  callUpdateStatusMatch,
  displayCallCenterCategory,
  isCallCenterOutcome,
  sortCallCenterCategories,
} from "@/lib/contact-call-center-categories";

describe("call center categories", () => {
  it("keeps template colors stable", () => {
    expect(callCenterCategoryColor("Interested")).toBe(
      CALL_CENTER_CATEGORY_COLORS.Interested,
    );
    expect(callCenterCategoryColor("Not Responding")).toBe(
      CALL_CENTER_CATEGORY_COLORS["Not Responding"],
    );
  });

  it("sorts template categories in legend order", () => {
    expect(
      sortCallCenterCategories([
        "Busy",
        "Interested",
        "N/A",
        "Custom Extra",
      ]),
    ).toEqual(["N/A", "Interested", "Busy", "Custom Extra"]);
  });

  it("places Contacted after templates", () => {
    expect(
      sortCallCenterCategories(["Contacted", "Interested", "Busy"]),
    ).toEqual(["Interested", "Busy", "Contacted"]);
  });

  it("gives Contacted a stable chart color", () => {
    expect(callCenterCategoryColor("Contacted")).toBe("#38bdf8");
  });

  it("hides bulk allocation only", () => {
    expect([...CALL_CENTER_CHART_EXCLUDED_CATEGORIES]).toEqual(["allocation"]);
  });

  it("keeps N/A off the merchant choice list", () => {
    expect(CALL_CENTER_OUTCOME_VALUES).not.toContain(CALL_CENTER_UNCONTACTED_CATEGORY);
    expect(isCallCenterOutcome("N/A")).toBe(false);
    expect(isCallCenterOutcome("Interested")).toBe(true);
  });

  it("treats N/A call update status as not contacted yet", () => {
    expect(callUpdateStatusMatch("N/A")).toEqual({
      OR: [
        { category: null },
        { category: "" },
        { category: { equals: "N/A" } },
      ],
    });
    expect(callUpdateStatusMatch("Interested")).toEqual({
      category: { equals: "Interested" },
    });
    expect(callUpdateStatusMatch("  ")).toBeNull();
  });

  it("shows never-contacted contacts as N/A", () => {
    expect(displayCallCenterCategory(null)).toBe("N/A");
    expect(displayCallCenterCategory("  ")).toBe("N/A");
    expect(displayCallCenterCategory("Interested")).toBe("Interested");
  });
});
