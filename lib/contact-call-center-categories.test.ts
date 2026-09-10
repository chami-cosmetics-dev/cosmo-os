import { describe, expect, it } from "vitest";

import {
  CALL_CENTER_CATEGORY_COLORS,
  CALL_CENTER_CHART_EXCLUDED_CATEGORIES,
  callCenterCategoryColor,
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
});
