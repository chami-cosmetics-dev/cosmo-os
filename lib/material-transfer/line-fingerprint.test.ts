import { describe, expect, it } from "vitest";

import {
  fingerprintFromErpItems,
  fingerprintsMatch,
  materialTransferLineFingerprint,
} from "@/lib/material-transfer/line-fingerprint";

describe("materialTransferLineFingerprint", () => {
  it("ignores line order and normalizes codes", () => {
    expect(
      materialTransferLineFingerprint([
        { itemCode: "aaa_1", qty: 2 },
        { itemCode: "BBB_1", qty: 1 },
      ]),
    ).toBe(
      materialTransferLineFingerprint([
        { itemCode: "bbb_1", qty: 1 },
        { itemCode: "AAA_1", qty: 2 },
      ]),
    );
  });

  it("treats different qtys as different bags", () => {
    expect(
      fingerprintsMatch(
        materialTransferLineFingerprint([{ itemCode: "X", qty: 1 }]),
        materialTransferLineFingerprint([{ itemCode: "X", qty: 2 }]),
      ),
    ).toBe(false);
  });

  it("matches ERP item rows", () => {
    const expected = materialTransferLineFingerprint([
      { itemCode: "CER03_1", qty: 5 },
      { itemCode: "CEV18_1", qty: 1 },
    ]);
    const actual = fingerprintFromErpItems([
      { item_code: "CEV18_1", qty: 1 },
      { item_code: "CER03_1", qty: 5 },
    ]);
    expect(fingerprintsMatch(expected, actual)).toBe(true);
  });

  it("sums duplicate item codes like ERP merge", () => {
    expect(
      materialTransferLineFingerprint([
        { itemCode: "X_1", qty: 2 },
        { itemCode: "X_1", qty: 3 },
      ]),
    ).toBe(materialTransferLineFingerprint([{ itemCode: "X_1", qty: 5 }]));
  });
});
