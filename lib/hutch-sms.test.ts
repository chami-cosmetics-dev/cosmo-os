import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  portalFindUnique: vi.fn(),
  smsLogFindFirst: vi.fn(),
  smsLogCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsPortalConfig: { findUnique: mocks.portalFindUnique },
    smsLog: { findFirst: mocks.smsLogFindFirst, create: mocks.smsLogCreate },
  },
}));

import { AUTH_COOLDOWN_MS, sendSms } from "@/lib/hutch-sms";

const CONFIG_SAVED_AT = new Date("2026-09-09T10:00:00Z");

// getHutchToken caches tokens in module scope keyed by companyId, so each test needs its
// own company or a cached token leaks across tests and changes the attempt count.
let companySeq = 0;
let companyId = "c0";

function portal() {
  return {
    id: `cfg-${companyId}`,
    companyId,
    username: "sales@example.test",
    password: "secret",
    authUrl: "https://sms.example.test/api/login",
    smsUrl: "https://sms.example.test/api/sendsms",
    smsMask: "MASK",
    campaignName: "General",
    createdAt: CONFIG_SAVED_AT,
    updatedAt: CONFIG_SAVED_AT,
  };
}

/** Minimal Hutch double: login succeeds, send reports SUCCESS. */
function happyProvider() {
  return vi.fn(async (url: string) =>
    new Response(
      JSON.stringify(url.includes("/login") ? { accessToken: "tok" } : { status: "SUCCESS" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.HUTCH_SMS_PAUSED;
  companyId = `c${++companySeq}`;
  mocks.portalFindUnique.mockReset().mockResolvedValue(portal());
  mocks.smsLogFindFirst.mockReset().mockResolvedValue(null);
  mocks.smsLogCreate.mockReset().mockResolvedValue({});
});

describe("sendSms auth cooldown", () => {
  it("reports a missing portal config without contacting the provider", async () => {
    mocks.portalFindUnique.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendSms(companyId, "0771234567", "hi");

    expect(result).toEqual({ success: false, message: "SMS portal not configured for this company" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("honors HUTCH_SMS_PAUSED without contacting the provider", async () => {
    process.env.HUTCH_SMS_PAUSED = "1";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendSms(companyId, "0771234567", "hi");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(false);
      expect(result.message).toContain("HUTCH_SMS_PAUSED");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.portalFindUnique).not.toHaveBeenCalled();
  });

  it("honors paused portal URLs without contacting the provider", async () => {
    mocks.portalFindUnique.mockResolvedValue({
      ...portal(),
      authUrl: "https://hutch-sms-paused.invalid/api/login",
      smsUrl: "https://hutch-sms-paused.invalid/api/sendsms",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendSms(companyId, "0771234567", "hi");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(false);
      expect(result.message).toContain("hutch-sms-paused");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends normally when no recent 401 is on record", async () => {
    const provider = happyProvider();
    vi.stubGlobal("fetch", provider);

    const result = await sendSms(companyId, "0771234567", "hi");

    expect(result.success).toBe(true);
    expect(provider).toHaveBeenCalled();
  });

  it("pauses without calling the provider while the cooldown is still running", async () => {
    // A 401 one minute ago: well inside the cooldown.
    mocks.smsLogFindFirst.mockResolvedValue({ sentAt: new Date(Date.now() - 60_000) });
    const provider = happyProvider();
    vi.stubGlobal("fetch", provider);

    const result = await sendSms(companyId, "0771234567", "hi");

    expect(result.success).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    if (!result.success) {
      expect(result.retryable).toBe(false);
      expect(result.message).toContain("will retry automatically");
    }
  });

  it("states the remaining wait in minutes", async () => {
    mocks.smsLogFindFirst.mockResolvedValue({ sentAt: new Date(Date.now() - 5 * 60_000) });
    vi.stubGlobal("fetch", happyProvider());

    const result = await sendSms(companyId, "0771234567", "hi");

    // 15 min cooldown, 5 min elapsed -> ~10 min left
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("~10 min");
  });

  it("probes the provider again once the cooldown has elapsed", async () => {
    mocks.smsLogFindFirst.mockResolvedValue({
      sentAt: new Date(Date.now() - (AUTH_COOLDOWN_MS + 60_000)),
    });
    const provider = happyProvider();
    vi.stubGlobal("fetch", provider);

    const result = await sendSms(companyId, "0771234567", "hi");

    expect(result.success).toBe(true);
    expect(provider).toHaveBeenCalled();
  });

  it("ignores a 401 that predates the last credential save", async () => {
    // The gate query is scoped to sentAt >= config.updatedAt, so a stale 401 finds nothing.
    mocks.smsLogFindFirst.mockImplementation(async (args: { where: { sentAt: { gte: Date } } }) =>
      args.where.sentAt.gte >= CONFIG_SAVED_AT ? null : { sentAt: new Date("2026-09-08T00:00:00Z") },
    );
    const provider = happyProvider();
    vi.stubGlobal("fetch", provider);

    const result = await sendSms(companyId, "0771234567", "hi");

    expect(result.success).toBe(true);
    expect(provider).toHaveBeenCalled();
  });

  it("collapses a queued burst into a single login once the cooldown lifts", async () => {
    const expired = new Date(Date.now() - (AUTH_COOLDOWN_MS + 60_000));
    // The probe fails on login; its failure row then makes the next caller see a fresh 401.
    let freshFailureLogged = false;
    mocks.smsLogFindFirst.mockImplementation(async () =>
      freshFailureLogged ? { sentAt: new Date() } : { sentAt: expired },
    );
    mocks.smsLogCreate.mockImplementation(async () => {
      freshFailureLogged = true;
      return {};
    });

    const provider = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", provider);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => sendSms(companyId, `07710000${i}`, "hi")),
    );

    expect(results.every((r) => !r.success)).toBe(true);
    // Only the probe reached Hutch; the other seven were paused by its failure.
    expect(provider).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => !r.success && r.message.includes("will retry automatically")))
      .toHaveLength(7);
  });
});
