import { describe, expect, it } from "vitest";

import { newItemRequestVoteBodySchema } from "./new-item-requests";

describe("newItemRequestVoteBodySchema", () => {
  it("requires name and a valid phone; email is optional", () => {
    const ok = newItemRequestVoteBodySchema.parse({
      customerName: " Nimal ",
      customerPhone: "+94 77 123 4567",
      customerEmail: "",
    });
    expect(ok).toMatchObject({ customerName: "Nimal", customerPhone: "0771234567" });
    expect(ok.customerEmail).toBeUndefined();

    expect(
      newItemRequestVoteBodySchema.parse({
        customerName: "Nimal",
        customerPhone: "0771234567",
        customerEmail: "A@B.CO",
      }).customerEmail,
    ).toBe("a@b.co");

    expect(newItemRequestVoteBodySchema.safeParse({ customerName: "", customerPhone: "0771234567" }).success).toBe(
      false,
    );
    expect(newItemRequestVoteBodySchema.safeParse({ customerName: "Nimal", customerPhone: "123" }).success).toBe(
      false,
    );
    expect(
      newItemRequestVoteBodySchema.safeParse({
        customerName: "Nimal",
        customerPhone: "0771234567",
        customerEmail: "bad",
      }).success,
    ).toBe(false);
  });
});
