import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth0", () => ({ auth0: { getSession: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findFirst: vi.fn() },
  erpnextInstance: { findFirst: vi.fn() },
  companyLocation: { findFirst: vi.fn() },
} }));
vi.mock("@/lib/osf/purchase-history", () => ({ verifyExactErpItem: vi.fn() }));
vi.mock("@/lib/osf/erp-stock", () => ({
  OsfErpError: class OsfErpError extends Error {},
}));

import { GET } from "@/app/api/admin/diagnostics/erp1-item-exists/route";
import { auth0 } from "@/lib/auth0";
import { prisma } from "@/lib/prisma";
import { verifyExactErpItem } from "@/lib/osf/purchase-history";
import { OsfErpError } from "@/lib/osf/erp-stock";

const companyId = "cmn2xcas1002crl5xtgoq28f5";
const instanceId = "cmr0zgv9e0003jp042b584n5b";
const locationId = "cmr0ztcao0001l804fi3qox8i";
const secret = "synthetic-secret";

function request(query = "itemCode=ACN002_1") {
  return new Request("https://cosmo.invalid/api/admin/diagnostics/erp1-item-exists?" + query);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth0.getSession).mockResolvedValue({ user: { sub: "auth0|admin" } } as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "admin" } as never);
  vi.mocked(prisma.erpnextInstance.findFirst).mockResolvedValue({
    baseUrl: "https://erp.invalid/", apiKey: "synthetic-key", apiSecret: secret,
  } as never);
  vi.mocked(prisma.companyLocation.findFirst).mockResolvedValue({ id: locationId } as never);
  vi.mocked(verifyExactErpItem).mockResolvedValue("VERIFIED");
});

describe("Admin ERP1 exact Item diagnostic", () => {
  it("denies unsigned and non-Admin sessions before the ERP lookup", async () => {
    vi.mocked(auth0.getSession).mockResolvedValueOnce(null);
    const unsigned = await GET(request());
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toEqual({ status: "PERMISSION_DENIED" });

    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
    const staff = await GET(request());
    expect(staff.status).toBe(403);
    expect(await staff.json()).toEqual({ status: "PERMISSION_DENIED" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        auth0Id: "auth0|admin", companyId,
        userRoles: { some: { role: { name: { in: ["admin", "super_admin"] } } } },
      },
      select: { id: true },
    });
    expect(prisma.erpnextInstance.findFirst).not.toHaveBeenCalled();
    expect(verifyExactErpItem).not.toHaveBeenCalled();
  });

  it("requires the signed-in identity's Admin role in the approved company", async () => {
    vi.mocked(auth0.getSession).mockResolvedValue({ user: { sub: "auth0|foreign" } } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    expect(await (await GET(request())).json()).toEqual({ status: "PERMISSION_DENIED" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ auth0Id: "auth0|foreign", companyId }),
    }));
    expect(verifyExactErpItem).not.toHaveBeenCalled();
  });

  it("rejects a different code, missing code, duplicate code, and extra parameters", async () => {
    for (const query of ["itemCode=OTHER", "", "itemCode=ACN002_1&itemCode=ACN002_1", "itemCode=ACN002_1&extra=1"]) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(await response.text()).toBe("");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(prisma.erpnextInstance.findFirst).not.toHaveBeenCalled();
    expect(verifyExactErpItem).not.toHaveBeenCalled();
  });

  it("binds both configuration queries to the approved company, instance, and location", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ status: "EXISTS" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(prisma.erpnextInstance.findFirst).toHaveBeenCalledWith({
      where: { id: instanceId, companyId },
      select: { baseUrl: true, apiKey: true, apiSecret: true },
    });
    expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith({
      where: {
        id: locationId, companyId, erpnextInstanceId: instanceId, erpnextCompany: "Cosmetics.lk",
      },
      select: { id: true },
    });
    expect(verifyExactErpItem).toHaveBeenCalledTimes(1);
    expect(verifyExactErpItem).toHaveBeenCalledWith({
      baseUrl: "https://erp.invalid", apiKey: "synthetic-key", apiSecret: secret,
    }, "ACN002_1");
    expect(JSON.stringify(await GET(request()).then((r) => r.json()))).not.toContain(secret);
  });

  it("returns NOT_FOUND for an absent exact Item", async () => {
    vi.mocked(verifyExactErpItem).mockResolvedValue("MAPPING_UNAVAILABLE");
    expect(await (await GET(request())).json()).toEqual({ status: "NOT_FOUND" });
  });

  it("does not call ERP when the scoped mapping is absent", async () => {
    vi.mocked(prisma.companyLocation.findFirst).mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(verifyExactErpItem).not.toHaveBeenCalled();
  });

  it("reduces provider authorization errors to PERMISSION_DENIED", async () => {
    vi.mocked(verifyExactErpItem).mockRejectedValue(new OsfErpError("ERPNext GET /api/resource/Item [403]: " + secret));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "PERMISSION_DENIED" });
  });

  it("hides provider failures and ambiguous data without inventing an existence result", async () => {
    vi.mocked(verifyExactErpItem).mockRejectedValueOnce(new Error("private provider response " + secret))
      .mockResolvedValueOnce("MAPPING_AMBIGUOUS")
      .mockRejectedValueOnce(new OsfErpError("ERPNext GET /api/resource/Item [500]: upstream says [403]"));
    for (let i = 0; i < 3; i++) {
      const response = await GET(request());
      expect(response.status).toBe(502);
      expect(await response.text()).toBe("");
    }
  });
});


