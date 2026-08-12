import { describe, expect, it } from "vitest";

import { extractCityFromAddress } from "@/lib/customer-insight/city";

describe("extractCityFromAddress", () => {
  it("matches known cities inside a full address", () => {
    expect(extractCityFromAddress("No 12, Galle Road, Colombo 03")).toBe("Colombo");
    expect(extractCityFromAddress("45 Temple Rd, Kandy")).toBe("Kandy");
    expect(extractCityFromAddress("Negombo")).toBe("Negombo");
  });

  it("uses last address segment when city is unknown", () => {
    expect(extractCityFromAddress("12 Main Street, Foo Town")).toBe("Foo Town");
  });

  it("returns null for empty / country-only", () => {
    expect(extractCityFromAddress("")).toBeNull();
    expect(extractCityFromAddress("Sri Lanka")).toBeNull();
  });
});
