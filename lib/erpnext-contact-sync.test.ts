import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildErpCustomerCreateBody,
  ensureErpCustomerByPhone,
  erpCustomerCreateLooksLikeDuplicate,
} from "@/lib/erpnext-contact-sync";

const cfg = {
  baseUrl: "https://erp.example.com",
  apiKey: "key",
  apiSecret: "secret",
};

describe("buildErpCustomerCreateBody", () => {
  it("uses canonical phone as Customer name and sets loyalty group", () => {
    expect(
      buildErpCustomerCreateBody({
        displayName: "Nipuni Gunathilaka",
        canonicalMobile: "0772038070",
        email: "nipuni@example.com",
        customerGroup: "Gold",
        defaultCompany: "Cosmetics",
      })
    ).toEqual({
      doctype: "Customer",
      name: "0772038070",
      customer_name: "Nipuni Gunathilaka",
      customer_type: "Individual",
      customer_group: "Gold",
      territory: "All Territories",
      custom_total_purchasing_value: 0,
      mobile_no: "0772038070",
      email_id: "nipuni@example.com",
      default_company: "Cosmetics",
    });
  });

  it("omits blank email and company", () => {
    const body = buildErpCustomerCreateBody({
      displayName: "  ",
      canonicalMobile: "0772038070",
      email: "  ",
      customerGroup: "Platinum",
      defaultCompany: null,
    });
    expect(body.customer_name).toBe("Guest");
    expect(body).not.toHaveProperty("email_id");
    expect(body).not.toHaveProperty("default_company");
    expect(body.customer_group).toBe("Platinum");
  });
});

describe("erpCustomerCreateLooksLikeDuplicate", () => {
  it("treats 409 as duplicate", () => {
    expect(erpCustomerCreateLooksLikeDuplicate(409, "")).toBe(true);
  });

  it("treats DuplicateError body as duplicate", () => {
    expect(
      erpCustomerCreateLooksLikeDuplicate(417, "DuplicateEntryError: 0772038070")
    ).toBe(true);
    expect(erpCustomerCreateLooksLikeDuplicate(400, "Customer already exists")).toBe(
      true
    );
  });

  it("does not treat other errors as duplicate", () => {
    expect(erpCustomerCreateLooksLikeDuplicate(500, "Internal Server Error")).toBe(
      false
    );
  });
});

describe("ensureErpCustomerByPhone", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns existing Customer and does not POST", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/resource/Customer?filters=")) {
        return new Response(JSON.stringify({ data: [{ name: "CUST-EXISTING" }] }), {
          status: 200,
        });
      }
      return new Response("unexpected", { status: 500 });
    });

    const result = await ensureErpCustomerByPhone(cfg, {
      phone: "0772038070",
      displayName: "Nipuni Gunathilaka",
      email: "nipuni@example.com",
      customerGroup: "Gold",
    });

    expect(result).toEqual({ customerName: "CUST-EXISTING", created: false });
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => {
      return String(url).endsWith("/api/resource/Customer") && init?.method === "POST";
    })).toBe(false);
  });

  it("creates Customer when phone is missing", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/resource/Customer?filters=")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes("/api/resource/Customer/0772038070")) {
        return new Response("{}", { status: 404 });
      }
      if (url.endsWith("/api/resource/Customer") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string; customer_group: string };
        expect(body.name).toBe("0772038070");
        expect(body.customer_group).toBe("Gold");
        return new Response(JSON.stringify({ data: { name: "0772038070" } }), {
          status: 200,
        });
      }
      return new Response("unexpected", { status: 500 });
    });

    const result = await ensureErpCustomerByPhone(cfg, {
      phone: "0772038070",
      displayName: "Nipuni Gunathilaka",
      email: "nipuni@example.com",
      customerGroup: "Gold",
    });

    expect(result).toEqual({ customerName: "0772038070", created: true });
  });

  it("reuses Customer when create races with 409", async () => {
    let posted = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/resource/Customer") && init?.method === "POST") {
        posted = true;
        return new Response("already exists", { status: 409 });
      }
      if (url.includes("/api/resource/Customer?filters=")) {
        return new Response(
          JSON.stringify({ data: posted ? [{ name: "0772038070" }] : [] }),
          { status: 200 }
        );
      }
      if (url.includes("/api/resource/Customer/0772038070")) {
        return new Response("{}", { status: 404 });
      }
      return new Response("unexpected", { status: 500 });
    });

    const result = await ensureErpCustomerByPhone(cfg, {
      phone: "0772038070",
      displayName: "Nipuni Gunathilaka",
      customerGroup: "Platinum",
    });

    expect(posted).toBe(true);
    expect(result.created).toBe(false);
    expect(result.customerName).toBe("0772038070");
  });

  it("throws when phone cannot be canonicalized", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/resource/Customer?filters=")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    await expect(
      ensureErpCustomerByPhone(cfg, {
        phone: "123",
        displayName: "Bad Phone",
        customerGroup: "Gold",
      })
    ).rejects.toThrow("not a valid Sri Lankan mobile");
  });
});
