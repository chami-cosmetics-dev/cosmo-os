import { describe, expect, it } from "vitest";

import { pickErp1Erp2Instances } from "@/lib/stock-price-missing/scan";
import type { OsfErpInstance } from "@/lib/osf/erp-stock";

function fake(label: string, id: string): OsfErpInstance {
  return {
    id,
    label,
    cfg: { baseUrl: `https://${id}.example`, apiKey: "k", apiSecret: "s" },
  };
}

describe("pickErp1Erp2Instances", () => {
  it("picks by ERP_1 / ERP_2 label even when createdAt order is reversed", () => {
    const { erp1, erp2 } = pickErp1Erp2Instances([
      fake("ERP_2 - Main", "second"),
      fake("ERP_1 - Main", "first"),
    ]);
    expect(erp1.id).toBe("first");
    expect(erp2.id).toBe("second");
  });

  it("falls back to list order when labels have no number", () => {
    const { erp1, erp2 } = pickErp1Erp2Instances([
      fake("Alpha", "a"),
      fake("Beta", "b"),
    ]);
    expect(erp1.id).toBe("a");
    expect(erp2.id).toBe("b");
  });
});
