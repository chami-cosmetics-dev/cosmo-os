import { describe, expect, it } from "vitest";

import {
  indexAllocatedMerchantByPhones,
  resolveExportAssignedMerchant,
} from "@/lib/contacts/export-allocated-merchant";

function mapFrom(rows: Parameters<typeof indexAllocatedMerchantByPhones>[1][]) {
  const map = new Map<string, string>();
  for (const row of rows) indexAllocatedMerchantByPhones(map, row);
  return map;
}

describe("resolveExportAssignedMerchant", () => {
  it("keeps the row's own allocated merchant", () => {
    const map = mapFrom([
      { assignedMerchant: "Chami", phoneNumber: "0771234567" },
    ]);
    expect(
      resolveExportAssignedMerchant("Netmi", ["0771234567"], map)
    ).toBe("Netmi");
  });

  it("fills blank allocation from a duplicate phone", () => {
    const map = mapFrom([
      { assignedMerchant: "Chami", phoneNumber: "0771234567" },
    ]);
    expect(resolveExportAssignedMerchant(null, ["0771234567"], map)).toBe(
      "Chami"
    );
    expect(resolveExportAssignedMerchant("", ["0771234567"], map)).toBe(
      "Chami"
    );
    expect(resolveExportAssignedMerchant("   ", ["0771234567"], map)).toBe(
      "Chami"
    );
  });

  it("matches local / +94 / 94 forms the way Insight search does", () => {
    const map = mapFrom([
      { assignedMerchant: "Semini", phoneNumber: "+94771234567" },
    ]);
    expect(resolveExportAssignedMerchant(null, ["0771234567"], map)).toBe(
      "Semini"
    );
    expect(resolveExportAssignedMerchant(null, ["94771234567"], map)).toBe(
      "Semini"
    );
  });

  it("fills from an allocated contact's secondary phone", () => {
    const map = mapFrom([
      {
        assignedMerchant: "Dinuli",
        phoneNumber: "0771111111",
        phones: [{ phoneNumber: "0779999999" }],
      },
    ]);
    expect(resolveExportAssignedMerchant(null, ["0779999999"], map)).toBe(
      "Dinuli"
    );
  });

  it("stays blank when no phone-matched allocation exists", () => {
    const map = mapFrom([
      { assignedMerchant: "Chami", phoneNumber: "0771234567" },
    ]);
    expect(resolveExportAssignedMerchant(null, ["0770000000"], map)).toBe("");
    expect(resolveExportAssignedMerchant(null, [null], map)).toBe("");
  });
});
