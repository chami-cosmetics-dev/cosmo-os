import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    riderMobileSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createMobileAccessToken,
  createRiderMobileSession,
  getRiderMobileSessionFromRequest,
  revokeRiderMobileSession,
} from "@/lib/mobile/auth";

describe("createMobileAccessToken", () => {
  it("returns a 64-character hex token", () => {
    const token = createMobileAccessToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates unique tokens", () => {
    const first = createMobileAccessToken();
    const second = createMobileAccessToken();
    expect(first).not.toBe(second);
  });
});

describe("createRiderMobileSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores hashed token and returns raw token to caller", async () => {
    prismaMock.riderMobileSession.create.mockResolvedValue({
      id: "session-1",
      expiresAt: new Date("2026-07-10T00:00:00.000Z"),
    });

    const result = await createRiderMobileSession({
      userId: "user-1",
      deviceName: " Rider phone ",
    });

    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(prismaMock.riderMobileSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        deviceName: "Rider phone",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(prismaMock.riderMobileSession.create.mock.calls[0][0].data.tokenHash).not.toBe(result.token);
  });
});

describe("getRiderMobileSessionFromRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when authorization header is missing", async () => {
    const request = new Request("http://localhost/api/mobile/v1/me");
    await expect(getRiderMobileSessionFromRequest(request)).resolves.toBeNull();
  });

  it("returns null for expired sessions", async () => {
    prismaMock.riderMobileSession.findUnique.mockResolvedValue({
      id: "session-1",
      status: "active",
      revokedAt: null,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      user: {
        employeeProfile: { isRider: true, status: "active" },
        company: null,
      },
    });

    const request = new Request("http://localhost/api/mobile/v1/me", {
      headers: { Authorization: "Bearer abc123" },
    });

    await expect(getRiderMobileSessionFromRequest(request)).resolves.toBeNull();
  });
});

describe("revokeRiderMobileSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the session as revoked", async () => {
    prismaMock.riderMobileSession.update.mockResolvedValue({ id: "session-1" });

    await revokeRiderMobileSession("session-1");

    expect(prismaMock.riderMobileSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        status: "revoked",
        revokedAt: expect.any(Date),
      },
    });
  });
});
