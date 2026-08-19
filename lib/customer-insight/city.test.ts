import { describe, expect, it } from "vitest";

import { cityForDisplay, extractCityFromAddress } from "@/lib/customer-insight/city";

describe("extractCityFromAddress", () => {
  it("matches known cities inside a full address", () => {
    expect(extractCityFromAddress("No 12, Galle Road, Colombo 03")).toBe("Colombo");
    expect(extractCityFromAddress("45 Temple Rd, Kandy")).toBe("Kandy");
    expect(extractCityFromAddress("Negombo")).toBe("Negombo");
  });

  it("pulls a known city out of messy Adapt-style lines", () => {
    expect(extractCityFromAddress("1 Kuliyapitiya Kuliyapitiya")).toBe("Kuliyapitiya");
    expect(extractCityFromAddress("1 Lake Road Boralesgamuwa")).toBe("Boralesgamuwa");
    expect(extractCityFromAddress("1 Luxapana road Thonikkal VAVUNIYA VAVUNIYA")).toBe(
      "Vavuniya"
    );
  });

  it("skips unclear village / street blobs", () => {
    expect(extractCityFromAddress("12 Main Street, Foo Town")).toBeNull();
    expect(extractCityFromAddress("1 Kudadeniya Bulathkohupitiya")).toBeNull();
    expect(extractCityFromAddress("1 Kudabuthgamuwa mulleriyawa mulleriyawa")).toBeNull();
  });

  it("keeps a clean merchant-typed city that is not on the known list", () => {
    expect(cityForDisplay("Mulleriyawa")).toBe("Mulleriyawa");
    expect(cityForDisplay("ja-ela")).toBe("Ja-Ela");
  });

  it("hides Adapt junk in display", () => {
    expect(cityForDisplay("1 Kudadeniya Bulathkohupitiya")).toBeNull();
  });
});
