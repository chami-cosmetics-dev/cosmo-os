import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { fetchBinActualQty, observedStockForColumns } from "@/lib/osf/erp-stock";

afterEach(() => vi.unstubAllGlobals());

it("retains the ERP decimal string and distinguishes zero from absent Bin data", async () => {
  const fetchMock = vi.fn(async () => Response.json({ data: [
    { item_code: "ABC", warehouse: "Main", actual_qty: "2.74900000000000000001" },
    { item_code: "ZERO", warehouse: "Main", actual_qty: 0 },
    { item_code: "MISSING", warehouse: "Main", actual_qty: null },
    { item_code: "BLANK", warehouse: "Main", actual_qty: "" },
  ] }));
  vi.stubGlobal("fetch", fetchMock);
  const observedBins = new Map<string, string>();
  await fetchBinActualQty({
    cfg: { baseUrl: "https://erp.invalid", apiKey: "fixture", apiSecret: "fixture" },
    warehouses: ["Main"], itemCodes: ["ABC", "ZERO", "MISSING", "BLANK"], observedBins,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(observedBins).toEqual(new Map([
    [JSON.stringify(["Main","ABC"]), "2.74900000000000000001"],
    [JSON.stringify(["Main","ZERO"]), "0"],
  ]));
});

it("checks each warehouse on its own instance and excludes overlapping scopes", () => {
  const first = { erpnextInstanceId: "one", warehouses: ["Main"] };
  const second = { erpnextInstanceId: "two", warehouses: ["Main"] };
  const bins = new Map([
    ["one", new Map([["Main::ABC", 0], ["Main::ONLY-FIRST", 1]])],
    ["two", new Map([["Main::ABC", 2.75]])],
  ]);
  expect(observedStockForColumns([first], bins, "ABC")).toBe(0);
  expect(observedStockForColumns([first,second], bins, "ABC")).toBe(2.75);
  expect(observedStockForColumns([first,second], bins, "ONLY-FIRST")).toBeNull();
  expect(observedStockForColumns([first,first], bins, "ABC")).toBeNull();
});
