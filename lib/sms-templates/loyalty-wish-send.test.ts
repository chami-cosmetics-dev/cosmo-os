import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueWish = vi.fn();
const findFirstContact = vi.fn();
const findManyTemplates = vi.fn();
const upsertWish = vi.fn();
const findUniqueConfig = vi.fn();
const findManyUsers = vi.fn();
const sendSmsMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    loyaltyWishSend: {
      findUnique: (...args: unknown[]) => findUniqueWish(...args),
      upsert: (...args: unknown[]) => upsertWish(...args),
    },
    contactMaster: {
      findFirst: (...args: unknown[]) => findFirstContact(...args),
    },
    smsTemplate: {
      findMany: (...args: unknown[]) => findManyTemplates(...args),
    },
    loyaltySmsConfig: {
      findUnique: (...args: unknown[]) => findUniqueConfig(...args),
    },
    user: {
      findMany: (...args: unknown[]) => findManyUsers(...args),
    },
  },
}));

vi.mock("@/lib/hutch-sms", () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
}));

import { maybeSendLoyaltyWishSms } from "@/lib/sms-templates/loyalty-wish-send";

describe("maybeSendLoyaltyWishSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueWish.mockResolvedValue(null);
    findManyTemplates.mockResolvedValue([]);
    findUniqueConfig.mockResolvedValue({ officeContactPhone: "0112345678" });
    findManyUsers.mockResolvedValue([
      {
        id: "u1",
        knownName: "Maheshi",
        name: "Maheshi",
        email: "m@x.com",
        couponCodes: [],
        mobile: "0779230386",
      },
    ]);
    upsertWish.mockResolvedValue({});
    sendSmsMock.mockResolvedValue({ success: true });
  });

  it("skips when success already recorded", async () => {
    findUniqueWish.mockResolvedValue({ status: "success" });
    const result = await maybeSendLoyaltyWishSms({
      companyId: "c1",
      contactId: "ct1",
      tier: "gold",
    });
    expect(result.status).toBe("skipped_already_sent");
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("skips when phone missing", async () => {
    findFirstContact.mockResolvedValue({
      id: "ct1",
      name: "Ayesha",
      phoneNumber: "",
      assignedMerchant: "Maheshi",
    });
    const result = await maybeSendLoyaltyWishSms({
      companyId: "c1",
      contactId: "ct1",
      tier: "gold",
    });
    expect(result.status).toBe("skipped_no_phone");
    expect(upsertWish).toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("sends gold wish with template key", async () => {
    findFirstContact.mockResolvedValue({
      id: "ct1",
      name: "Ayesha",
      phoneNumber: "0771111111",
      assignedMerchant: "Maheshi",
    });
    const result = await maybeSendLoyaltyWishSms({
      companyId: "c1",
      contactId: "ct1",
      tier: "gold",
      actorUserId: "actor",
    });
    expect(result.status).toBe("success");
    expect(result.templateKey).toMatch(/^loyalty_gold_wish_/);
    expect(sendSmsMock).toHaveBeenCalledOnce();
    const message = sendSmsMock.mock.calls[0]?.[2] as string;
    expect(message).toContain("10");
    expect(message).toContain("0779230386");
  });

  it("records failed when provider fails without throwing", async () => {
    findFirstContact.mockResolvedValue({
      id: "ct1",
      name: "Ayesha",
      phoneNumber: "0771111111",
      assignedMerchant: "Maheshi",
    });
    sendSmsMock.mockResolvedValue({ success: false, message: "provider down" });
    const result = await maybeSendLoyaltyWishSms({
      companyId: "c1",
      contactId: "ct1",
      tier: "platinum",
    });
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("provider");
  });
});
