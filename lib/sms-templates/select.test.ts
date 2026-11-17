import { describe, expect, it } from "vitest";

import {
  filterActiveSmsTemplatePool,
  pickRandomSmsTemplate,
} from "@/lib/sms-templates/select";

describe("filterActiveSmsTemplatePool", () => {
  const templates = [
    { key: "g1", purpose: "gold_wish", body: "A", active: true },
    { key: "g2", purpose: "gold_wish", body: "B", active: true },
    { key: "g3", purpose: "gold_wish", body: "C", active: false },
    { key: "p1", purpose: "platinum_wish", body: "P", active: true },
    { key: "empty", purpose: "gold_wish", body: "  ", active: true },
  ];

  it("keeps only active matching purpose with non-empty body", () => {
    const pool = filterActiveSmsTemplatePool(templates, "gold_wish");
    expect(pool.map((t) => t.key).sort()).toEqual(["g1", "g2"]);
  });

  it("returns empty when none match", () => {
    expect(filterActiveSmsTemplatePool(templates, "custom")).toEqual([]);
  });
});

describe("pickRandomSmsTemplate", () => {
  it("returns null for empty pool", () => {
    expect(pickRandomSmsTemplate([])).toBeNull();
  });

  it("picks by RNG index", () => {
    const pool = [{ key: "a" }, { key: "b" }, { key: "c" }];
    expect(pickRandomSmsTemplate(pool, () => 0)).toEqual({ key: "a" });
    expect(pickRandomSmsTemplate(pool, () => 0.99)).toEqual({ key: "c" });
  });

  it("can hit both gold templates across many draws", () => {
    const pool = [
      { key: "loyalty_gold_wish_1" },
      { key: "loyalty_gold_wish_2" },
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const picked = pickRandomSmsTemplate(pool);
      if (picked) seen.add(picked.key);
    }
    expect(seen.has("loyalty_gold_wish_1")).toBe(true);
    expect(seen.has("loyalty_gold_wish_2")).toBe(true);
  });
});
