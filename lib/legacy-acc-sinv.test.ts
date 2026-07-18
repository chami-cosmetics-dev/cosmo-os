import { describe, expect, it } from "vitest";

import {
  excludeLegacyAccSinvOrdersWhere,
  getLegacyAccSinvFulfillmentWhere,
  isLegacyAccSinvRef,
} from "@/lib/legacy-acc-sinv";

describe("legacy ACC-SINV fulfillment policy", () => {
  it("matches legacy references case-insensitively after trimming", () => {
    expect(isLegacyAccSinvRef(" ACC-SINV-2026-00380 ")).toBe(true);
    expect(isLegacyAccSinvRef("acc-sinv-2026-00392")).toBe(true);
  });

  it("does not match the current Vault invoice series", () => {
    expect(isLegacyAccSinvRef("SV100-0695")).toBe(false);
    expect(isLegacyAccSinvRef(null)).toBe(false);
  });

  it("excludes both name and ERP invoice reference fields", () => {
    expect(excludeLegacyAccSinvOrdersWhere).toEqual({
      NOT: {
        OR: [
          { name: { startsWith: "ACC-SINV", mode: "insensitive" } },
          { erpnextInvoiceId: { startsWith: "ACC-SINV", mode: "insensitive" } },
        ],
      },
    });
  });

  it("applies the exclusion only to Vault deployments", () => {
    expect(getLegacyAccSinvFulfillmentWhere(true)).toEqual(
      excludeLegacyAccSinvOrdersWhere,
    );
    expect(getLegacyAccSinvFulfillmentWhere(false)).toEqual({});
  });
});
