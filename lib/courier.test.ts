import { describe, expect, it } from "vitest";

import { isCitypakCourier } from "@/lib/courier";

describe("isCitypakCourier", () => {
  it("matches common Citypak spellings", () => {
    expect(isCitypakCourier("City Pack")).toBe(true);
    expect(isCitypakCourier("Citypak")).toBe(true);
    expect(isCitypakCourier("CityPack")).toBe(true);
    expect(isCitypakCourier("CITY PAK")).toBe(true);
  });

  it("rejects other couriers", () => {
    expect(isCitypakCourier("Domex")).toBe(false);
    expect(isCitypakCourier(null)).toBe(false);
    expect(isCitypakCourier("")).toBe(false);
  });
});
