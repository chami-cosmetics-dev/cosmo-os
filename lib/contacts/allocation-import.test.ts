import { describe, expect, it } from "vitest";

import {
  parseAllocationCsv,
  resolveAllocationAssignee,
  rowPhoneAndMerchant,
} from "@/lib/contacts/allocation-import";

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

describe("allocation assignee resolve", () => {
  const users = new Map<string, string>([
    ["chami", "Chami"],
    ["semini", "Semini"],
  ]);

  it("maps DM-General onto the Contact Master roster name", () => {
    expect(resolveAllocationAssignee("DM-General", users)).toBe("DM - General");
    expect(resolveAllocationAssignee("DM_General", users)).toBe("DM - General");
    expect(resolveAllocationAssignee("MER115", users)).toBe("DM - General");
  });

  it("keeps a real user name ahead of an alias bucket", () => {
    expect(resolveAllocationAssignee("Semini", users)).toBe("Semini");
    expect(resolveAllocationAssignee("Chami", users)).toBe("Chami");
  });

  it("accepts staff and error-number buckets", () => {
    expect(resolveAllocationAssignee("STAFF SALES", users)).toBe("STAFF SALES");
    expect(resolveAllocationAssignee("Staff category", users)).toBe("STAFF SALES");
    expect(resolveAllocationAssignee("Error number category", users)).toBe(
      "ERROR NUMBER"
    );
  });

  it("rejects an unknown merchant", () => {
    expect(resolveAllocationAssignee("Not A Merchant", users)).toBeNull();
  });
});
