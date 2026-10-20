import { describe, expect, it } from "vitest";

import { PURCHASE_HEADERS } from "@/lib/vault-supplement-import/headers";
import { buildTemplateWorkbook } from "@/lib/vault-supplement-import/template-workbook";
import { loadXlsxWorkbook } from "@/lib/vault-supplement-import/xlsx-load";

describe("template workbook", () => {
  it("writes the 18 headers, the example phone, and the K2*L2 formula", async () => {
    const workbook = await loadXlsxWorkbook(await buildTemplateWorkbook());
    const purchases = workbook.getWorksheet("Purchases");
    expect(purchases).toBeTruthy();
    const headers = PURCHASE_HEADERS.map((_, index) => String(purchases!.getCell(1, index + 1).value));
    expect(headers).toEqual([...PURCHASE_HEADERS]);
    expect(purchases!.getCell(2, 2).value).toBe("0771234567");
    const lineAmount = purchases!.getCell(2, 13).value;
    expect(lineAmount).toMatchObject({ formula: "K2*L2" });
    const guide = workbook.getWorksheet("Guide");
    expect(String(guide?.getCell(2, 1).value)).toContain("Delete the orange example row");
  });
});
