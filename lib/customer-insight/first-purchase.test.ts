import { describe, expect, it } from "vitest";

import {
  earlierDate,
  firstPurchaseAtForContact,
  lastPurchaseAtForContact,
  laterDate,
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

describe("laterDate", () => {
  const older = new Date("2024-01-01T00:00:00.000Z");
  const newer = new Date("2026-06-01T00:00:00.000Z");

  it("keeps the later instant", () => {
    expect(laterDate(newer, older)).toEqual(newer);
    expect(laterDate(older, newer)).toEqual(newer);
  });

  it("uses the date that exists", () => {
    expect(laterDate(null, newer)).toEqual(newer);
    expect(laterDate(older, undefined)).toEqual(older);
    expect(laterDate(null, null)).toBeNull();
  });
});

describe("lastPurchaseAtForContact", () => {
  const phoneAt = new Date("2023-03-01T00:00:00.000Z");
  const emailAt = new Date("2022-01-01T00:00:00.000Z");
  const adaptAt = new Date("2021-05-01T00:00:00.000Z");
  const laterPhoneAt = new Date("2026-08-11T00:00:00.000Z");

  const indexes: FirstPurchaseIndexes = {
    byPhone: new Map([["0771234567", laterPhoneAt]]),
    byEmail: new Map([["buyer@example.com", emailAt]]),
    byContactId: new Map([["c1", adaptAt]]),
  };

  it("uses the newest of phone match and Adapt", () => {
    const at = lastPurchaseAtForContact(indexes, {
      id: "c1",
      phoneNumber: "0771234567",
      email: "buyer@example.com",
    });
    expect(at).toEqual(laterPhoneAt);
  });

  it("ignores email when the contact has a phone", () => {
    const at = lastPurchaseAtForContact(
      {
        byPhone: new Map([["0771234567", phoneAt]]),
        byEmail: new Map([["buyer@example.com", emailAt]]),
        byContactId: new Map(),
      },
      {
        id: "c2",
        phoneNumber: "0771234567",
        email: "buyer@example.com",
      }
    );
    expect(at).toEqual(phoneAt);
  });

  it("is null when there is no completed sale", () => {
    const at = lastPurchaseAtForContact(
      { byPhone: new Map(), byEmail: new Map(), byContactId: new Map() },
      { id: "c4", phoneNumber: "0771696734" }
    );
    expect(at).toBeNull();
  });
});
