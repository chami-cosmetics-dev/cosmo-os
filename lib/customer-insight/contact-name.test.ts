import { describe, expect, it } from "vitest";

import {
  CONTACT_FIRST_NAME_TITLE_ERROR,
  contactFirstNameError,
  isBlockedFirstNameTitle,
  isCompleteContactName,
  joinContactName,
  splitContactName,
} from "@/lib/customer-insight/contact-name";

describe("contact-name", () => {
  it("blocks honorifics used as a first name", () => {
    expect(isBlockedFirstNameTitle("Mr")).toBe(true);
    expect(isBlockedFirstNameTitle("mr.")).toBe(true);
    expect(isBlockedFirstNameTitle("MRS")).toBe(true);
    expect(isBlockedFirstNameTitle("Miss")).toBe(true);
    expect(isBlockedFirstNameTitle("Ms")).toBe(true);
    expect(isBlockedFirstNameTitle("Dr")).toBe(true);
    expect(isBlockedFirstNameTitle("Mr John")).toBe(true);
    expect(isBlockedFirstNameTitle("Missy")).toBe(false);
    expect(isBlockedFirstNameTitle("Jane")).toBe(false);
    expect(contactFirstNameError("Mrs")).toBe(CONTACT_FIRST_NAME_TITLE_ERROR);
  });

  it("splits a stored full name and strips leading titles", () => {
    expect(splitContactName("Jane Doe")).toEqual({
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(splitContactName("Mr John Smith")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
    expect(splitContactName("Mrs. Perera")).toEqual({
      firstName: "Perera",
      lastName: "",
    });
    expect(splitContactName("Jane")).toEqual({
      firstName: "Jane",
      lastName: "",
    });
    expect(splitContactName("Mr")).toEqual({ firstName: "", lastName: "" });
  });

  it("joins first and last name", () => {
    expect(joinContactName(" Jane ", " Doe ")).toBe("Jane Doe");
    expect(joinContactName("Jane", "")).toBe("Jane");
  });

  it("requires both parts for a complete contact name", () => {
    expect(isCompleteContactName("Jane Doe")).toBe(true);
    expect(isCompleteContactName("Mr John Smith")).toBe(true);
    expect(isCompleteContactName("Jane")).toBe(false);
    expect(isCompleteContactName("Mr")).toBe(false);
    expect(isCompleteContactName("")).toBe(false);
  });
});
