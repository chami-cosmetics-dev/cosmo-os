import { describe, expect, it } from "vitest";

import { CONTACT_FIRST_NAME_TITLE_ERROR } from "@/lib/customer-insight/contact-name";
import { customerInsightProfilePatchSchema } from "@/lib/validation/customer-insight";

describe("customerInsightProfilePatchSchema name fields", () => {
  it("joins first and last name", () => {
    const parsed = customerInsightProfilePatchSchema.parse({
      firstName: " Jane ",
      lastName: " Doe ",
    });
    expect(parsed.name).toBe("Jane Doe");
  });

  it("requires both first and last name when either is sent", () => {
    expect(
      customerInsightProfilePatchSchema.safeParse({ firstName: "Jane" }).success
    ).toBe(false);
    expect(
      customerInsightProfilePatchSchema.safeParse({ lastName: "Doe" }).success
    ).toBe(false);
    expect(
      customerInsightProfilePatchSchema.safeParse({ firstName: "", lastName: "Doe" })
        .success
    ).toBe(false);
  });

  it("rejects honorifics as a first name", () => {
    const parsed = customerInsightProfilePatchSchema.safeParse({
      firstName: "Mrs",
      lastName: "Perera",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((issue) => issue.message === CONTACT_FIRST_NAME_TITLE_ERROR)
      ).toBe(true);
    }
  });

  it("still accepts a two-part name on the legacy name field", () => {
    expect(
      customerInsightProfilePatchSchema.parse({ name: "Jane Doe" }).name
    ).toBe("Jane Doe");
    expect(
      customerInsightProfilePatchSchema.safeParse({ name: "Mr" }).success
    ).toBe(false);
    expect(
      customerInsightProfilePatchSchema.safeParse({ name: "Jane" }).success
    ).toBe(false);
  });
});
