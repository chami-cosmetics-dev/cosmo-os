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

  it("allows first or last name to be omitted", () => {
    expect(customerInsightProfilePatchSchema.parse({ firstName: "Jane" }).name).toBe(
      "Jane"
    );
    expect(customerInsightProfilePatchSchema.parse({ lastName: "Doe" }).name).toBe(
      "Doe"
    );
    expect(
      customerInsightProfilePatchSchema.parse({ firstName: "", lastName: "Doe" }).name
    ).toBe("Doe");
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

  it("still accepts a name on the legacy name field", () => {
    expect(
      customerInsightProfilePatchSchema.parse({ name: "Jane Doe" }).name
    ).toBe("Jane Doe");
    expect(
      customerInsightProfilePatchSchema.safeParse({ name: "Mr" }).success
    ).toBe(false);
    expect(customerInsightProfilePatchSchema.parse({ name: "Jane" }).name).toBe(
      "Jane"
    );
  });
});
