import { describe, expect, it } from "vitest";

import {
  CONSULTATION_PHONE_PATTERN,
  cleanConsultationPhone,
  currentConsultationMonth,
  findDuplicateInvoices,
  formatConsultationMonth,
  groupConsultations,
  isValidConsultationDate,
  resolveCustomerName,
  resolveSuggestedMerchant,
  splitInvoiceNumbers,
  suggestConsultationMerchant,
  summarizeConsultations,
  EMPTY_CONSULTATION_FILTERS,
  filterConsultationGroups,
  hasConsultationFilters,
  type ConsultationFilters,
  type ConsultationRow,
} from "./shared";

function row(partial: Partial<ConsultationRow>): ConsultationRow {
  return {
    id: "r",
    entryId: "e",
    consultationDate: "2026-10-19",
    contactNumber: "0771234567",
    invoiceNumber: "400-000001",
    customerName: "Nisansala",
    merchantKind: "showroom",
    merchantName: "Maharagama",
    physicalReview: "",
    createdAt: "2026-10-19T05:00:00.000Z",
    ...partial,
  };
}

describe("merchant suggestion", () => {
  it("matches the coupon owner's full or first name to the dropdown", () => {
    expect(suggestConsultationMerchant({ merchantName: "ishadi", locationName: null })).toBe("Ishadi");
    expect(suggestConsultationMerchant({ merchantName: "Maheshi", locationName: null })).toBe(
      "Maheshi Priyadarshani",
    );
    expect(suggestConsultationMerchant({ merchantName: "Sachini Fernando", locationName: null })).toBe("Sachini");
  });

  it("falls back to the showroom by location, else nothing", () => {
    expect(
      suggestConsultationMerchant({ merchantName: "Unknown Person", locationName: "Cosmetics.lk - Pepiliyana" }),
    ).toBe("Showroom - Pepiliyana");
    expect(suggestConsultationMerchant({ merchantName: null, locationName: "Cosmetics.lk - New Web" })).toBeNull();
  });

  it("maps the MER114-CM001 coupon to the Pepiliyana showroom ahead of its owner", () => {
    expect(
      suggestConsultationMerchant({
        merchantName: "Venushka",
        locationName: "LMJ International Lanka Pvt Ltd",
        discountCodes: ["LOYALCS2", "mer114-cm001"],
      }),
    ).toBe("Showroom - Pepiliyana");
    expect(
      suggestConsultationMerchant({ merchantName: "Venushka", locationName: null, discountCodes: ["LOYALCS2"] }),
    ).toBe("Venushka");
  });

  it("only auto-picks when every invoice agrees", () => {
    expect(resolveSuggestedMerchant([{ suggestedMerchant: "Ishadi" }, { suggestedMerchant: null }])).toBe("Ishadi");
    expect(resolveSuggestedMerchant([{ suggestedMerchant: "Ishadi" }, { suggestedMerchant: "Dulshi" }])).toBeNull();
    expect(resolveSuggestedMerchant([])).toBeNull();
  });
});

describe("filterConsultationGroups", () => {
  const groups = groupConsultations([
    row({ id: "a1", entryId: "a", consultationDate: "2026-10-05", contactNumber: "0711111111", invoiceNumber: "400-000100" }),
    row({ id: "b1", entryId: "b", consultationDate: "2026-10-22", contactNumber: "0718257523", invoiceNumber: "400-000567" }),
    row({ id: "b2", entryId: "b", consultationDate: "2026-10-22", contactNumber: "0718257523", invoiceNumber: "600-006515" }),
  ]);
  const ids = (filters: Partial<ConsultationFilters>) =>
    filterConsultationGroups(groups, { ...EMPTY_CONSULTATION_FILTERS, ...filters }).map((group) => group.entryId);

  it("filters by inclusive date range", () => {
    expect(ids({ dateFrom: "2026-10-22" })).toEqual(["b"]);
    expect(ids({ dateTo: "2026-10-05" })).toEqual(["a"]);
    expect(ids({ dateFrom: "2026-10-06", dateTo: "2026-10-21" })).toEqual([]);
  });

  it("matches part of a contact number, ignoring spaces / dashes", () => {
    expect(ids({ contactNumber: "071 825" })).toEqual(["b"]);
  });

  it("keeps the whole customer when any of their invoices matches", () => {
    expect(ids({ invoiceNumber: "6515" })).toEqual(["b"]);
    expect(filterConsultationGroups(groups, { ...EMPTY_CONSULTATION_FILTERS, invoiceNumber: "6515" })[0].rows).toHaveLength(2);
  });

  it("returns everything with no filters", () => {
    expect(ids({})).toEqual(["a", "b"]);
    expect(hasConsultationFilters(EMPTY_CONSULTATION_FILTERS)).toBe(false);
  });
});

describe("resolveCustomerName", () => {
  it("uses the name on a single invoice", () => {
    expect(resolveCustomerName([{ customerName: " Nisansala " }])).toEqual({
      status: "resolved",
      name: "Nisansala",
    });
  });

  it("uses the shared name when several invoices agree (case/space insensitive)", () => {
    expect(
      resolveCustomerName([{ customerName: "Nisansala Perera" }, { customerName: "nisansala  perera" }]),
    ).toEqual({ status: "resolved", name: "Nisansala Perera" });
  });

  it("flags different names on several invoices as ambiguous", () => {
    expect(resolveCustomerName([{ customerName: "Nisansala" }, { customerName: "Kamal" }])).toEqual({
      status: "ambiguous",
    });
  });

  it("flags a missing name among several invoices as ambiguous", () => {
    expect(resolveCustomerName([{ customerName: "Nisansala" }, { customerName: null }])).toEqual({
      status: "ambiguous",
    });
  });

  it("returns none for no invoices or a single unnamed invoice", () => {
    expect(resolveCustomerName([])).toEqual({ status: "none" });
    expect(resolveCustomerName([{ customerName: null }])).toEqual({ status: "none" });
  });
});

describe("splitInvoiceNumbers", () => {
  it("splits on slash, comma and whitespace and dedupes", () => {
    expect(splitInvoiceNumbers("400-000438 / 600-004939,400-000438  600-1")).toEqual([
      "400-000438",
      "600-004939",
      "600-1",
    ]);
  });
});

describe("phone validation", () => {
  it("accepts 10 digits starting with 0 after cleaning", () => {
    expect(CONSULTATION_PHONE_PATTERN.test(cleanConsultationPhone("077 123-4567"))).toBe(true);
    expect(CONSULTATION_PHONE_PATTERN.test("771234567")).toBe(false);
    expect(CONSULTATION_PHONE_PATTERN.test("94771234567")).toBe(false);
  });
});

describe("dates and months", () => {
  it("validates real calendar dates only", () => {
    expect(isValidConsultationDate("2026-10-19")).toBe(true);
    expect(isValidConsultationDate("2026-02-30")).toBe(false);
  });

  it("uses the Colombo month", () => {
    // 2026-10-31 20:00 UTC is already 1 November in Colombo.
    expect(currentConsultationMonth(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11");
    expect(formatConsultationMonth("2026-10")).toBe("October 2026");
  });
});

describe("summary", () => {
  it("counts customers by entry, every invoice row, and customers with a review", () => {
    const rows = [
      row({ id: "1", entryId: "a", invoiceNumber: "400-000001", physicalReview: "Good" }),
      row({ id: "2", entryId: "a", invoiceNumber: "400-000002", physicalReview: "Good" }),
      row({ id: "3", entryId: "b", invoiceNumber: "400-000001", physicalReview: "  " }),
    ];
    expect(summarizeConsultations(rows)).toEqual({ customers: 2, invoices: 3, reviews: 1 });
    expect([...findDuplicateInvoices(rows)]).toEqual(["400-000001"]);
    expect(groupConsultations(rows).map((group) => group.rows.map((r) => r.id))).toEqual([["1", "2"], ["3"]]);
  });
});
