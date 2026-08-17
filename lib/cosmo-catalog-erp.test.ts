import { describe, expect, it } from "vitest";

import { pickCosmoCatalogErpInstance } from "@/lib/cosmo-catalog-erp";

const erp1 = {
  id: "erp1",
  label: "ERP_1 - Main",
  baseUrl: "https://cosmetics-lk-01.m.frappe.cloud",
};
const erp2 = {
  id: "erp2",
  label: "ERP_2 - Main",
  baseUrl: "https://cosmetics-lk-02.m.frappe.cloud",
};

describe("pickCosmoCatalogErpInstance", () => {
  it("uses Cosmetics.lk shop ERP, not LWK", () => {
    expect(
      pickCosmoCatalogErpInstance({
        locations: [
          { name: "LWK Enterprises Pvt Ltd", locationReference: "003", instanceId: "erp2" },
          { name: "Cosmetics.lk", locationReference: "006", instanceId: "erp1" },
        ],
        instances: [erp2, erp1],
      })?.id,
    ).toBe("erp1");
  });

  it("falls back to ERP_1 label when shop has no linked instance", () => {
    expect(
      pickCosmoCatalogErpInstance({
        locations: [
          { name: "LWK Enterprises Pvt Ltd", locationReference: "003", instanceId: "erp2" },
          { name: "Cosmetics.lk", locationReference: "006", instanceId: null },
        ],
        instances: [erp2, erp1],
      })?.id,
    ).toBe("erp1");
  });

  it("does not use LWK/ERP_2 as catalog source", () => {
    expect(
      pickCosmoCatalogErpInstance({
        locations: [
          { name: "LWK Enterprises Pvt Ltd", locationReference: "003", instanceId: "erp2" },
        ],
        instances: [erp2],
      }),
    ).toBeNull();
  });
});
