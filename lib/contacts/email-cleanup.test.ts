import { describe, expect, it } from "vitest";

import {
  buildSuspectReviewItem,
  collectSuspectMatches,
  emailMatchesReason,
  isInvalidContactEmail,
  matchesCosmeticsPattern,
} from "@/lib/contacts/email-cleanup";

describe("email-cleanup helpers", () => {
  describe("isInvalidContactEmail", () => {
    it("returns false for empty or valid emails", () => {
      expect(isInvalidContactEmail("")).toBe(false);
      expect(isInvalidContactEmail("user@example.com")).toBe(false);
    });

    it("returns true for malformed emails", () => {
      expect(isInvalidContactEmail("not-an-email")).toBe(true);
      expect(isInvalidContactEmail("missing-at.com")).toBe(true);
    });
  });

  describe("matchesCosmeticsPattern", () => {
    it("matches cosmetic and cosmatics substrings case-insensitively", () => {
      expect(matchesCosmeticsPattern("cosmetics@example.com")).toBe(true);
      expect(matchesCosmeticsPattern("user@cosmatics.example")).toBe(true);
      expect(matchesCosmeticsPattern("COSMETIC.shop@test")).toBe(true);
      expect(matchesCosmeticsPattern("user@gmail.com")).toBe(false);
    });
  });

  describe("collectSuspectMatches", () => {
    const contact = {
      id: "c1",
      name: "Jane",
      phoneNumber: "0771234567",
      email: "not-an-email",
      emails: [
        { id: "e1", email: "cosmetics@company.com", createdAt: new Date("2024-01-01") },
        { id: "e2", email: "jane@gmail.com", createdAt: new Date("2024-02-01") },
      ],
    };

    it("collects invalid primary and secondary", () => {
      const invalid = collectSuspectMatches(contact, "invalid");
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.matchedEmail).toBe("not-an-email");

      const withBadSecondary = {
        ...contact,
        email: "jane@gmail.com",
        emails: [{ id: "e3", email: "bad@", createdAt: new Date() }],
      };
      expect(collectSuspectMatches(withBadSecondary, "invalid")).toHaveLength(1);
      expect(collectSuspectMatches(withBadSecondary, "invalid")[0]?.matchedEmail).toBe("bad@");
    });

    it("collects cosmetics on primary or secondary", () => {
      const cosmetics = collectSuspectMatches(contact, "cosmetics_pattern");
      expect(cosmetics.some((m) => m.matchedEmail === "cosmetics@company.com")).toBe(true);
    });

    it("buildSuspectReviewItem returns first match", () => {
      expect(buildSuspectReviewItem(contact, "invalid")?.matchedEmail).toBe("not-an-email");
    });
  });

  describe("emailMatchesReason", () => {
    it("respects reason-specific rules", () => {
      expect(emailMatchesReason("not-an-email", "invalid")).toBe(true);
      expect(emailMatchesReason("cosmetics@x.com", "invalid")).toBe(false);
      expect(emailMatchesReason("cosmetics@x.com", "cosmetics_pattern")).toBe(true);
    });
  });
});
