import { describe, expect, it } from "vitest";

import {
  findForeignShopRow,
  foreignShopRowError,
  orderMatchesInvoice,
} from "@/lib/book-notes/order-shop";

const mnk = {
  id: "ord_mnk",
  companyLocationId: "loc_mnk",
  shopLabel: "MNK",
  posProfile: null,
  erpnextWarehouse: "Shop Warehouse - MNK",
  keys: ["acc-sinv-mnk-1"],
};

const coolPlanet = {
  id: "ord_cp",
  companyLocationId: "loc_cosmo",
  shopLabel: "Cosmetics.lk",
  posProfile: "Cool Planet Nugegoda Shop",
  erpnextWarehouse: "Cool Planet Nugegoda Shop Warehouse - Cosmo",
  keys: ["acc-sinv-cp-1"],
};

const maharagama = {
  id: "ord_maha",
  companyLocationId: "loc_cosmo",
  shopLabel: "Cosmetics.lk",
  posProfile: "Maharagama Shop",
  erpnextWarehouse: "Maharagama Shop Warehouse - Cosmo",
  keys: ["acc-sinv-maha-1"],
};

describe("orderMatchesInvoice", () => {
  it("matches invoice keys case-insensitively", () => {
    expect(orderMatchesInvoice(mnk.keys, "ACC-SINV-MNK-1")).toBe(true);
    expect(orderMatchesInvoice(mnk.keys, "nope")).toBe(false);
  });
});

describe("findForeignShopRow", () => {
  it("rejects an invoice from another trading shop", () => {
    expect(
      findForeignShopRow({
        selectedLocationId: "loc_mnk",
        selectedIsCosmetics: false,
        cosmeticsPosScope: null,
        rows: [{ idxNo: "1", salesInvoice: "ACC-SINV-CP-1" }],
        hits: [mnk, coolPlanet],
      }),
    ).toEqual({
      error: foreignShopRowError({
        idxNo: "1",
        salesInvoice: "ACC-SINV-CP-1",
        shopLabel: "Cosmetics.lk",
      }),
    });
  });

  it("allows Cosmetics invoice on the merchant POS floor", () => {
    expect(
      findForeignShopRow({
        selectedLocationId: "loc_cosmo",
        selectedIsCosmetics: true,
        cosmeticsPosScope: {
          posProfiles: ["Cool Planet Nugegoda Shop"],
          warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
        },
        rows: [
          { idxNo: "1", salesInvoice: "ACC-SINV-CP-1", orderId: "ord_cp" },
        ],
        hits: [coolPlanet, maharagama],
      }),
    ).toBeNull();
  });

  it("rejects Cosmetics invoice from another POS floor", () => {
    expect(
      findForeignShopRow({
        selectedLocationId: "loc_cosmo",
        selectedIsCosmetics: true,
        cosmeticsPosScope: {
          posProfiles: ["Cool Planet Nugegoda Shop"],
          warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
        },
        rows: [{ idxNo: "2", salesInvoice: "ACC-SINV-MAHA-1" }],
        hits: [coolPlanet, maharagama],
      }),
    ).toEqual({
      error: foreignShopRowError({
        idxNo: "2",
        salesInvoice: "ACC-SINV-MAHA-1",
        shopLabel: "Maharagama Shop",
      }),
    });
  });

  it("allows unknown handwritten invoices", () => {
    expect(
      findForeignShopRow({
        selectedLocationId: "loc_cosmo",
        selectedIsCosmetics: true,
        cosmeticsPosScope: {
          posProfiles: ["Cool Planet Nugegoda Shop"],
          warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
        },
        rows: [{ idxNo: "3", salesInvoice: "HAND-1" }],
        hits: [coolPlanet],
      }),
    ).toBeNull();
  });
});
