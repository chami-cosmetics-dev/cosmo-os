import { describe, expect, it } from "vitest";

import {
  earlierDate,
  firstPurchaseAtForContact,
  type FirstPurchaseIndexes,
} from "@/lib/customer-insight/first-purchase";

describe("earlierDate", () => {
  const older = new Date("2024-01-01T00:00:00.000Z");
  const newer = new Date("2026-06-01T00:00:00.000Z");

  it("keeps the earlier instant", () => {
    expect(earlierDate(newer, older)).toEqual(older);
    expect(earlierDate(older, newer)).toEqual(older);
  });

  it("uses the date that exists", () => {
    expect(earlierDate(null, newer)).toEqual(newer);
    expect(earlierDate(older, undefined)).toEqual(older);
    expect(earlierDate(null, null)).toBeNull();
  });
});

describe("firstPurchaseAtForContact", () => {
  const phoneAt = new Date("2023-03-01T00:00:00.000Z");
  const emailAt = new Date("2022-01-01T00:00:00.000Z");
  const adaptAt = new Date("2021-05-01T00:00:00.000Z");

  const indexes: FirstPurchaseIndexes = {
    byPhone: new Map([["0771234567", phoneAt]]),
    byEmail: new Map([["buyer@example.com", emailAt]]),
    byContactId: new Map([["c1", adaptAt]]),
  };

  it("uses the earliest of phone match and Adapt", () => {
    const at = firstPurchaseAtForContact(indexes, {
      id: "c1",
      phoneNumber: "0771234567",
      email: "buyer@example.com",
    });
    expect(at).toEqual(adaptAt);
  });

  it("ignores email when the contact has a phone", () => {
    const at = firstPurchaseAtForContact(
      { ...indexes, byContactId: new Map() },
      {
        id: "c2",
        phoneNumber: "0771234567",
        email: "buyer@example.com",
      }
    );
    expect(at).toEqual(phoneAt);
  });

  it("uses email only when the contact has no phone", () => {
    const at = firstPurchaseAtForContact(
      { ...indexes, byContactId: new Map() },
      {
        id: "c3",
        phoneNumber: null,
        email: "buyer@example.com",
      }
    );
    expect(at).toEqual(emailAt);
  });
});

describe("earlierDate", () => {
  const older = new Date("2024-01-01T00:00:00.000Z");
  const newer = new Date("2026-06-01T00:00:00.000Z");

  it("keeps the earlier instant", () => {
    expect(earlierDate(newer, older)).toEqual(older);
    expect(earlierDate(older, newer)).toEqual(older);
  });

  it("uses the date that exists", () => {
    expect(earlierDate(null, newer)).toEqual(newer);
    expect(earlierDate(older, undefined)).toEqual(older);
    expect(earlierDate(null, null)).toBeNull();
  });
});
