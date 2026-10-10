import { describe, expect, it } from "vitest";

import {
  erpTaxStatusColumn,
  slotForInstance,
  webhookItemCode,
} from "@/lib/vat-status/apply-tax-status";

describe("erp tax status webhook helpers", () => {
  it("maps each ERP slot to its product column", () => {
    expect(erpTaxStatusColumn("erp1")).toBe("erp1TaxStatus");
    expect(erpTaxStatusColumn("erp2")).toBe("erp2TaxStatus");
  });

  it("reads item_code, then name", () => {
    expect(webhookItemCode({ item_code: " ord04_1 " })).toBe("ord04_1");
    expect(webhookItemCode({ name: "AB-1" })).toBe("AB-1");
    expect(webhookItemCode({})).toBeNull();
  });

  it("matches the webhook instance to ERP1 or ERP2", () => {
    const slots = { erp1: { id: "a" }, erp2: { id: "b" } };
    expect(slotForInstance("a", slots)).toBe("erp1");
    expect(slotForInstance("b", slots)).toBe("erp2");
    expect(slotForInstance("c", slots)).toBeNull();
  });
});
