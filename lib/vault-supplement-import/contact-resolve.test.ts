import { describe, expect, it } from "vitest";

import {
  customerGroupKey,
  fillEmptyContactFields,
  phonesAreSameCustomer,
  resolveContactMatch,
} from "@/lib/vault-supplement-import/contact-resolve";
import { REJECT_REASON } from "@/lib/vault-supplement-import/headers";

describe("contact resolve", () => {
  it("treats 077 and +94 as one customer", () => {
    expect(phonesAreSameCustomer("0771234567", "+94771234567")).toBe(true);
    expect(customerGroupKey("0771234567", "a@example.com")).toBe(
      customerGroupKey("+94771234567", "other@example.com"),
    );
  });

  it("rejects a phone and email that hit different contacts", () => {
    expect(
      resolveContactMatch({
        phoneMatches: [{ id: "phone-contact" }],
        emailMatches: [{ id: "email-contact" }],
      }),
    ).toEqual({ ok: false, reason: REJECT_REASON.phoneEmailDiffer });
  });

  it("rejects more than one phone match", () => {
    expect(
      resolveContactMatch({
        phoneMatches: [{ id: "a" }, { id: "b" }],
        emailMatches: [],
      }),
    ).toEqual({ ok: false, reason: REJECT_REASON.phoneMany });
  });

  it("matches the phone contact when email is the same contact", () => {
    expect(
      resolveContactMatch({
        phoneMatches: [{ id: "same" }],
        emailMatches: [{ id: "same" }],
      }),
    ).toEqual({ ok: true, action: "match", contactId: "same" });
  });

  it("fills only empty profile fields", () => {
    expect(
      fillEmptyContactFields(
        { name: "Kept", phoneNumber: null, city: "Kandy" },
        { name: "New", phoneNumber: "0771234567", city: "Colombo", address: "12 Galle Rd" },
      ),
    ).toEqual({ phoneNumber: "0771234567", address: "12 Galle Rd" });
  });
});
