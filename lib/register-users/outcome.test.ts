import { describe, expect, it } from "vitest";

import {
  normalizeRegisterEmail,
  outcomeForExisting,
  profileFieldsChanged,
} from "@/lib/register-users/outcome";

describe("profileFieldsChanged", () => {
  const base = {
    name: "Amal",
    email: "amal@example.com",
    birthYear: 1990,
    birthMonth: 3,
    birthDay: 15,
  };

  it("is false when name/email/birthday match after normalize", () => {
    expect(
      profileFieldsChanged(base, {
        name: "  Amal  ",
        email: "AMAL@example.com",
        birthYear: 1990,
        birthMonth: 3,
        birthDay: 15,
      }),
    ).toBe(false);
  });

  it("is true when email or name changes", () => {
    expect(
      profileFieldsChanged(base, { ...base, email: "new@example.com" }),
    ).toBe(true);
    expect(profileFieldsChanged(base, { ...base, name: "Amal Perera" })).toBe(
      true,
    );
  });

  it("skips birthday when compareBirthday is false", () => {
    expect(
      profileFieldsChanged(
        base,
        { ...base, birthYear: 2000 },
        false,
      ),
    ).toBe(false);
  });
});

describe("outcomeForExisting", () => {
  it("maps changed → updated, unchanged → already_registered", () => {
    expect(outcomeForExisting(false)).toBe("already_registered");
    expect(outcomeForExisting(true)).toBe("updated");
  });
});

describe("normalizeRegisterEmail", () => {
  it("lowercases and treats blank as null", () => {
    expect(normalizeRegisterEmail("  Foo@Bar.com ")).toBe("foo@bar.com");
    expect(normalizeRegisterEmail("")).toBeNull();
    expect(normalizeRegisterEmail(null)).toBeNull();
  });
});
