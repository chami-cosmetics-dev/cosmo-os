import { describe, expect, it } from "vitest";

import {
  getCosmeticsLkChannelLabel,
  resolveCosmeticsLkChannel,
} from "@/lib/cosmetics-lk-channel";

describe("resolveCosmeticsLkChannel", () => {
  it("treats web / shopify / unknown as website", () => {
    expect(resolveCosmeticsLkChannel("web")).toBe("website");
    expect(resolveCosmeticsLkChannel("shopify")).toBe("website");
    expect(resolveCosmeticsLkChannel("unknown")).toBe("website");
    expect(resolveCosmeticsLkChannel("")).toBe("website");
    expect(resolveCosmeticsLkChannel(null)).toBe("website");
    expect(resolveCosmeticsLkChannel(undefined)).toBe("website");
  });

  it("treats ERP invoices and counter sales as erp1", () => {
    expect(resolveCosmeticsLkChannel("erpnext")).toBe("erp1");
    expect(resolveCosmeticsLkChannel("erpnext-pos")).toBe("erp1");
    expect(resolveCosmeticsLkChannel("pos")).toBe("erp1");
  });

  it("keeps Cosmo-created orders separate", () => {
    expect(resolveCosmeticsLkChannel("manual")).toBe("manual");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(resolveCosmeticsLkChannel("  ERPNext  ")).toBe("erp1");
    expect(resolveCosmeticsLkChannel("Manual")).toBe("manual");
    expect(resolveCosmeticsLkChannel(" Web ")).toBe("website");
  });

  it("labels channels for staff", () => {
    expect(getCosmeticsLkChannelLabel("website")).toBe("Website");
    expect(getCosmeticsLkChannelLabel("erp1")).toBe("ERP1");
    expect(getCosmeticsLkChannelLabel("manual")).toBe("Manual");
  });
});
