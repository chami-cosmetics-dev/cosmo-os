import { describe, expect, it } from "vitest";

import {
  pickCosmoCatalogErp2Fallback,
  pickCosmoCatalogErpInstance,
} from "@/lib/cosmo-catalog-erp";

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

describe("pickCosmoCatalogErp2Fallback", () => {
  it("picks ERP_2 by label excluding primary", () => {
    expect(
      pickCosmoCatalogErp2Fallback({
        instances: [erp1, erp2],
        primaryId: "erp1",
      })?.id,
    ).toBe("erp2");
  });

  it("picks cosmetics-lk-02 by URL when labels missing", () => {
    expect(
      pickCosmoCatalogErp2Fallback({
        instances: [
          erp1,
          { id: "x", label: "Trading", baseUrl: "https://cosmetics-lk-02.m.frappe.cloud" },
        ],
        primaryId: "erp1",
      })?.id,
    ).toBe("x");
  });

  it("never returns the primary instance", () => {
    expect(
      pickCosmoCatalogErp2Fallback({
        instances: [erp1],
        primaryId: "erp1",
      }),
    ).toBeNull();
  });
});
