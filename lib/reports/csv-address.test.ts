import { describe, expect, it } from "vitest";

import {
  buildAddressSearchText,
  inferDistrictFromAddressText,
  resolveAddressDistrict,
} from "@/lib/address-district";
import { formatAddress, getAddressDistrict } from "@/lib/reports/csv";

describe("inferDistrictFromAddressText", () => {
  it("matches district names inside messy address lines", () => {
    expect(inferDistrictFromAddressText("12 Lake Rd, Gampaha")).toBe("Gampaha");
    expect(inferDistrictFromAddressText("1 Luxapana road Thonikkal VAVUNIYA")).toBe("Vavuniya");
    expect(inferDistrictFromAddressText("Anuradapura town")).toBe("Anuradhapura");
  });

  it("maps known towns to districts when district is omitted", () => {
    expect(inferDistrictFromAddressText("45 Galle Road, Dehiwala")).toBe("Colombo");
    expect(inferDistrictFromAddressText("Kiribathgoda")).toBe("Gampaha");
    expect(inferDistrictFromAddressText("No 12, Galle Road, Colombo 03")).toBe("Colombo");
  });
});

describe("resolveAddressDistrict", () => {
  it("prefers explicit province over inferred text", () => {
    expect(
      resolveAddressDistrict({
        province: "Galle",
        address1: "12 Main St, Dehiwala",
      })
    ).toBe("Galle");
  });

  it("infers from address fields when province is missing", () => {
    expect(
      resolveAddressDistrict({
        address1: "Temple Road",
        city: "Nugegoda",
      })
    ).toBe("Colombo");
  });
});

describe("getAddressDistrict", () => {
  it("prefers province over province_code", () => {
    expect(
      getAddressDistrict({
        province: "Colombo",
        province_code: "CMB",
      })
    ).toBe("Colombo");
  });

  it("falls back to province_code when province is blank", () => {
    expect(
      getAddressDistrict({
        province: "",
        province_code: "CMB",
      })
    ).toBe("CMB");
  });
});

describe("formatAddress", () => {
  it("includes district in the city line", () => {
    expect(
      formatAddress({
        address1: "12 Main St",
        city: "Dehiwala",
        country: "Sri Lanka",
      })
    ).toBe("12 Main St, Dehiwala, Colombo, Sri Lanka");
  });

  it("uses explicit province when present", () => {
    expect(
      formatAddress({
        address1: "12 Main St",
        city: "Dehiwala",
        province: "Colombo",
        country: "Sri Lanka",
      })
    ).toBe("12 Main St, Dehiwala, Colombo, Sri Lanka");
  });
});

describe("buildAddressSearchText", () => {
  it("joins structured address fields", () => {
    expect(
      buildAddressSearchText({
        address1: "12 Main St",
        address2: "Near temple",
        city: "Moratuwa",
      })
    ).toBe("12 Main St, Near temple, Moratuwa");
  });
});
