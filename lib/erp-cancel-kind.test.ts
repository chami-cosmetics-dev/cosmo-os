import { describe, expect, it } from "vitest";

import { erpCancelKindLabel } from "@/lib/erpnext-sync";

describe("erpCancelKindLabel", () => {
  it("maps Cosmo kinds to ERP Select values", () => {
    expect(erpCancelKindLabel("replacement")).toBe("Replacement");
    expect(erpCancelKindLabel("customer_cancel")).toBe("Customer Cancel");
  });
});
