import { describe, expect, it } from "vitest";

import { parseAllocationCsv, rowPhoneAndMerchant } from "@/lib/contacts/allocation-import";

describe("allocation import csv", () => {
  it("reads phone and merchant from common headers", () => {
    const rows = parseAllocationCsv(
      "phone_number,allocated_merchant\n0771234567,Chami\n"
    );
    expect(rows).toHaveLength(1);
    expect(rowPhoneAndMerchant(rows[0]!)).toEqual({
      phone: "0771234567",
      merchant: "Chami",
    });
  });

  it("accepts TP / Allocate to aliases", () => {
    const rows = parseAllocationCsv("TP,Allocate to\n94771234567,Netmi\n");
    expect(rowPhoneAndMerchant(rows[0]!)).toEqual({
      phone: "94771234567",
      merchant: "Netmi",
    });
  });
});
