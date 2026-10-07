import { describe, expect, it } from "vitest";

import { applyRegisterEmailName } from "@/lib/email-templates/render";

describe("applyRegisterEmailName", () => {
  it("replaces [Name] and {{name}}", () => {
    expect(applyRegisterEmailName("Hi [Name]", "Amaya")).toBe("Hi Amaya");
    expect(applyRegisterEmailName("Welcome, {{name}}", "Amaya")).toBe(
      "Welcome, Amaya",
    );
  });

  it("is case-insensitive", () => {
    expect(applyRegisterEmailName("Hi [NAME]", "Amaya")).toBe("Hi Amaya");
    expect(applyRegisterEmailName("Hi {{Name}}", "Amaya")).toBe("Hi Amaya");
  });
});
