import { describe, expect, it } from "vitest";

import {
  getLoyaltyProfileMissingFields,
  isLoyaltyProfileComplete,
} from "@/lib/customer-insight/loyalty-profile-complete";

const complete = {
  name: "Jane Doe",
  email: "jane@example.com",
  phoneNumber: "+94771234567",
  gender: "Female",
  language: "English",
  birthMonth: 3,
  birthDay: 15,
  city: "Colombo",
  address: "123 Main St",
};

describe("loyalty-profile-complete", () => {
  it("accepts month and day without birth year", () => {
    expect(isLoyaltyProfileComplete(complete)).toBe(true);
    expect(getLoyaltyProfileMissingFields(complete)).toEqual([]);
  });

  it("flags each missing field", () => {
    const missing = getLoyaltyProfileMissingFields({
      name: "",
      email: null,
      phoneNumber: null,
      gender: null,
      language: null,
      birthMonth: null,
      birthDay: null,
      city: "",
      address: null,
    });
    expect(missing).toContain("Name");
    expect(missing).toContain("Email");
    expect(missing).toContain("Phone");
    expect(missing).toContain("Birth date (month & day)");
  });
});
