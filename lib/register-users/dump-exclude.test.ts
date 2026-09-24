import { describe, expect, it } from "vitest";

import {
  osRegistrationDumpExcludeWhere,
  shouldExcludeOsRegistrationFromDump,
} from "@/lib/register-users/dump-exclude";

describe("shouldExcludeOsRegistrationFromDump", () => {
  it("omits OS-created contact with no purchase", () => {
    expect(
      shouldExcludeOsRegistrationFromDump({
        osRegistrationCreated: true,
        lastPurchaseAt: null,
        purchaseOrderCount: 0,
      }),
    ).toBe(true);
  });

  it("includes after a purchase", () => {
    expect(
      shouldExcludeOsRegistrationFromDump({
        osRegistrationCreated: true,
        lastPurchaseAt: new Date("2026-09-24T10:00:00.000Z"),
        purchaseOrderCount: 1,
      }),
    ).toBe(false);
  });

  it("includes already dump-eligible contacts", () => {
    expect(
      shouldExcludeOsRegistrationFromDump({
        osRegistrationCreated: false,
        lastPurchaseAt: null,
        purchaseOrderCount: 0,
      }),
    ).toBe(false);
  });
});

describe("osRegistrationDumpExcludeWhere", () => {
  it("negates created + no lastPurchase + zero orders", () => {
    expect(osRegistrationDumpExcludeWhere()).toEqual({
      NOT: {
        AND: [
          { osRegistrationCreated: true },
          { lastPurchaseAt: null },
          { purchaseOrderCount: 0 },
        ],
      },
    });
  });
});
