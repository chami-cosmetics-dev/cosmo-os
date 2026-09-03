import { describe, expect, it, vi } from "vitest";

import { resolveAdaptContact, pickBetterContact } from "@/lib/adapt-import/contact-resolve";
import { adaptEmailForContactUse, isSharedMerchantEmail } from "@/lib/adapt-import/shared-emails";

describe("shared merchant emails", () => {
  it("flags staff / merchant placeholder emails", () => {
    expect(isSharedMerchantEmail("sales@cosmetics.lk")).toBe(true);
    expect(isSharedMerchantEmail("info@lmj.lk")).toBe(true);
    expect(isSharedMerchantEmail("nirukshi.cosmetics@outlook.com")).toBe(true);
    expect(isSharedMerchantEmail("hpg.inoka@gmail.com")).toBe(true);
    expect(isSharedMerchantEmail("oshadhisakya@gmail.com")).toBe(false);
  });

  it("nulls shared emails for contact use", () => {
    expect(adaptEmailForContactUse("sales@cosmetics.lk")).toBeNull();
    expect(adaptEmailForContactUse("oshadhisakya@gmail.com")).toBe("oshadhisakya@gmail.com");
  });
});

describe("resolveAdaptContact phone-first", () => {
  it("matches by phone only when phone present (ignores email)", async () => {
    const phoneContact = {
      id: "c-phone",
      name: "Phone Match",
      email: "real@ex.com",
      phoneNumber: "0773794362",
      recentMerchant: null,
      lastPurchaseAt: null,
      source: "erp2",
      updatedAt: new Date("2024-01-01"),
    };
    const emailContact = {
      id: "c-email",
      name: "Email Match",
      email: "sales@cosmetics.lk",
      phoneNumber: "0711111111",
      recentMerchant: null,
      lastPurchaseAt: new Date("2025-01-01"),
      source: "adapt",
      updatedAt: new Date("2025-01-01"),
    };

    const db = {
      contactMaster: {
        findMany: vi.fn(async ({ where }: { where: { phoneNumber?: { in: string[] }; email?: unknown } }) => {
          if (where.phoneNumber) return [phoneContact];
          return [emailContact];
        }),
      },
      contactPhone: {
        findMany: vi.fn(async () => []),
      },
      contactEmail: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await resolveAdaptContact({
      companyId: "co1",
      phone: "0773794362",
      email: "sales@cosmetics.lk",
      db: db as never,
    });

    expect(result.status).toBe("match");
    if (result.status === "match") {
      expect(result.contact.id).toBe("c-phone");
    }
    expect(db.contactEmail.findMany).not.toHaveBeenCalled();
  });

  it("falls back to email only when phone missing, skipping shared merchant email", async () => {
    const db = {
      contactMaster: {
        findMany: vi.fn(async () => []),
      },
      contactPhone: {
        findMany: vi.fn(async () => []),
      },
      contactEmail: {
        findMany: vi.fn(async () => []),
      },
    };

    const sharedOnly = await resolveAdaptContact({
      companyId: "co1",
      phone: null,
      email: "sales@cosmetics.lk",
      db: db as never,
    });
    expect(sharedOnly.status).toBe("none");
    expect(db.contactMaster.findMany).not.toHaveBeenCalled();

    const customer = {
      id: "c-email",
      name: "Email Only",
      email: "customer@ex.com",
      phoneNumber: null,
      recentMerchant: null,
      lastPurchaseAt: null,
      source: null,
      updatedAt: new Date(),
    };
    db.contactMaster.findMany = vi.fn(async () => [customer]);

    const byEmail = await resolveAdaptContact({
      companyId: "co1",
      phone: null,
      email: "customer@ex.com",
      db: db as never,
    });
    expect(byEmail.status).toBe("match");
    if (byEmail.status === "match") {
      expect(byEmail.contact.id).toBe("c-email");
    }
  });
});

describe("pickBetterContact", () => {
  it("prefers contact with later lastPurchaseAt", () => {
    const a = { id: "a", lastPurchaseAt: new Date("2020-01-01"), updatedAt: new Date("2020-01-01") };
    const b = { id: "b", lastPurchaseAt: new Date("2021-01-01"), updatedAt: new Date("2020-01-01") };
    expect(pickBetterContact(a, b).id).toBe("b");
  });
});
