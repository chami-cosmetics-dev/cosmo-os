import { describe, expect, it } from "vitest";

import {
  buildKokoDuplicateGroups,
  buildOrderItemFingerprint,
  findDuplicateNoticeSiblings,
  phoneKeyForKokoDuplicate,
} from "@/lib/koko-duplicate-group";

describe("buildOrderItemFingerprint", () => {
  it("matches identical multisets regardless of order", () => {
    const a = buildOrderItemFingerprint([
      { sku: "SKU-A", quantity: 1 },
      { sku: "SKU-B", quantity: 2 },
    ]);
    const b = buildOrderItemFingerprint([
      { sku: "SKU-B", quantity: 2 },
      { sku: "SKU-A", quantity: 1 },
    ]);
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });

  it("differs on quantity", () => {
    const a = buildOrderItemFingerprint([{ sku: "SKU-A", quantity: 1 }]);
    const b = buildOrderItemFingerprint([{ sku: "SKU-A", quantity: 2 }]);
    expect(a).not.toBe(b);
  });
});

describe("phoneKeyForKokoDuplicate", () => {
  it("canonicalizes SL mobiles", () => {
    expect(phoneKeyForKokoDuplicate("0712345678")).toBe(
      phoneKeyForKokoDuplicate("+94712345678"),
    );
  });
});

describe("buildKokoDuplicateGroups", () => {
  const fp = buildOrderItemFingerprint([{ sku: "X", quantity: 1 }])!;
  const phone = phoneKeyForKokoDuplicate("0712345678")!;
  const now = new Date("2026-09-18T12:00:00Z");

  it("groups same phone + fingerprint with pending and approved", () => {
    const groups = buildKokoDuplicateGroups([
      {
        orderId: "o1",
        approvalId: "a1",
        status: "approved",
        createdAt: new Date("2026-09-17T10:00:00Z"),
        customerPhone: "0712345678",
        fingerprint: fp,
        phoneKey: phone,
        kokoLinkGeneratedAt: new Date("2026-09-17T09:00:00Z"),
        invoiceNo: "INV-1",
      },
      {
        orderId: "o2",
        approvalId: "a2",
        status: "pending",
        createdAt: now,
        customerPhone: "0712345678",
        fingerprint: fp,
        phoneKey: phone,
        kokoLinkGeneratedAt: new Date("2026-09-18T11:30:00Z"),
        invoiceNo: "INV-2",
      },
    ]);
    expect(groups.size).toBe(1);
    const g = [...groups.values()][0]!;
    expect(g.duplicateGroupSize).toBe(2);
  });

  it("does not group different fingerprints", () => {
    const fp2 = buildOrderItemFingerprint([{ sku: "Y", quantity: 1 }])!;
    const groups = buildKokoDuplicateGroups([
      {
        orderId: "o1",
        status: "pending",
        createdAt: now,
        customerPhone: "0712345678",
        fingerprint: fp,
        phoneKey: phone,
      },
      {
        orderId: "o2",
        status: "pending",
        createdAt: now,
        customerPhone: "0712345678",
        fingerprint: fp2,
        phoneKey: phone,
      },
    ]);
    expect(groups.size).toBe(0);
  });
});

describe("findDuplicateNoticeSiblings", () => {
  const fp = buildOrderItemFingerprint([{ sku: "X", quantity: 1 }])!;
  const phone = phoneKeyForKokoDuplicate("0712345678")!;
  const now = new Date("2026-09-18T12:00:00Z");

  it("returns matching siblings", () => {
    const siblings = findDuplicateNoticeSiblings(
      { orderId: "o2", phoneKey: phone, fingerprint: fp, createdAt: now },
      [
        {
          orderId: "o1",
          status: "pending",
          createdAt: new Date("2026-09-17T10:00:00Z"),
          customerPhone: "0712345678",
          fingerprint: fp,
          phoneKey: phone,
          invoiceNo: "INV-1",
        },
      ],
    );
    expect(siblings).toHaveLength(1);
    expect(siblings[0]!.orderId).toBe("o1");
  });
});
