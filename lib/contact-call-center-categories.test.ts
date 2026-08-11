import { describe, expect, it } from "vitest";

import {
  CALL_CENTER_CATEGORY_COLORS,
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
});
