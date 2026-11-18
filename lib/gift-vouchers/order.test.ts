import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Voucher as a line item: an order with no voucher coupon but a line item whose SKU is a group's
 * prefix + digits with a negative price gets the batch-code field, and codes apply / suggest /
 * validate exactly as for a coupon. Prisma is an in-memory stand-in.
 */

type Line = { price: number; sku: string | null };
type Code = { id: string; code: string; used: boolean; orderId: string | null; orderNo: string | null; groupId: string };

const { db } = vi.hoisted(() => ({
  db: {
    order: null as null | { lineItems: Line[]; discountCodes: unknown },
    groups: [] as Array<{ id: string; name: string; codePrefix: string; startDate: Date; endDate: Date }>,
    codes: [] as Code[],
  },
}));

const groupOf = (id: string) => db.groups.find((g) => g.id === id)!;

vi.mock("@/lib/audit-log", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => {
  const codeApi = {
    findMany: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
      let rows = db.codes;
      const codeWhere = where.code as { in?: string[] } | undefined;
      if (codeWhere?.in) rows = rows.filter((c) => codeWhere.in!.includes(c.code));
      if (where.used === false) rows = rows.filter((c) => !c.used);
      const groupWhere = where.group as { codePrefix: { in: string[] } } | undefined;
      if (groupWhere) rows = rows.filter((c) => groupWhere.codePrefix.in.includes(groupOf(c.groupId).codePrefix));
      const or = where.OR as Array<{ code: { contains: string } }> | undefined;
      if (or) rows = rows.filter((c) => or.some((o) => c.code.includes(o.code.contains)));
      return rows.map((c) => ({
        ...c,
        group: select.group ? { ...groupOf(c.groupId) } : undefined,
      }));
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; used: boolean }; data: Partial<Code> }) => {
      const row = db.codes.find((c) => c.id === where.id && c.used === where.used);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
  };
  return {
    prisma: {
      order: {
        findFirst: vi.fn(async () =>
          db.order
            ? {
                id: "o1",
                name: "#1001",
                orderNumber: "1001",
                shopifyOrderId: "s1",
                erpnextCustomerId: null,
                sourceName: "erpnext-pos",
                discountCodes: db.order.discountCodes,
                rawPayload: {},
                customerPhone: "0771234567",
                shippingAddress: null,
                billingAddress: null,
                giftVoucherCodes: [],
                // As the select asks: only negative-price lines.
                lineItems: db.order.lineItems
                  .filter((l) => l.price < 0)
                  .map((l) => ({ price: l.price, productItem: { sku: l.sku } })),
              }
            : null,
        ),
      },
      giftVoucherGroup: {
        findMany: vi.fn(async ({ where }: { where: { codePrefix?: { in: string[] } } }) =>
          db.groups
            .filter((g) => !where.codePrefix || where.codePrefix.in.includes(g.codePrefix))
            .map((g) => ({ codePrefix: g.codePrefix })),
        ),
      },
      giftVoucherCode: codeApi,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ giftVoucherCode: codeApi })),
    },
  };
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

beforeEach(() => {
  db.groups = [
    { id: "g1", name: "NGV Nov", codePrefix: "NGV", startDate: day(-10), endDate: day(10) },
    { id: "g2", name: "SGV Nov", codePrefix: "SGV", startDate: day(-10), endDate: day(10) },
  ];
  db.codes = [
    { id: "c1", code: "COS14100001", used: false, orderId: null, orderNo: null, groupId: "g1" },
    { id: "c2", code: "COS14200002", used: false, orderId: null, orderNo: null, groupId: "g2" },
  ];
  db.order = {
    discountCodes: [],
    lineItems: [
      { price: 2500, sku: "CE019_1" },
      { price: -1000, sku: "NGV1000" },
    ],
  };
});

describe("voucher line item on an order (no voucher coupon)", () => {
  it("shows the field, labelled with the line item SKU", async () => {
    const { getOrderGiftVoucherState } = await import("@/lib/gift-vouchers/order");
    const state = await getOrderGiftVoucherState({ companyId: "co1", orderId: "o1", canApply: true });
    expect(state?.matchedCoupons).toEqual(["NGV1000"]);
  });

  it("no field when the price is not negative, or the SKU is not prefix + digits", async () => {
    const { getOrderGiftVoucherState } = await import("@/lib/gift-vouchers/order");
    for (const line of [
      { price: 1000, sku: "NGV1000" },
      { price: -1000, sku: "NGV1000A" },
      { price: -1000, sku: "ABC1000" },
    ]) {
      db.order!.lineItems = [line];
      const state = await getOrderGiftVoucherState({ companyId: "co1", orderId: "o1", canApply: true });
      expect(state?.matchedCoupons, JSON.stringify(line)).toEqual([]);
    }
  });

  it("applies a code from the matching group and marks it USED", async () => {
    const { applyGiftVouchersToOrder } = await import("@/lib/gift-vouchers/order");
    const result = await applyGiftVouchersToOrder({ companyId: "co1", orderId: "o1", actorUserId: "u1", codes: ["cos14100001"] });
    expect(result).toMatchObject({ ok: true });
    expect(db.codes.find((c) => c.code === "COS14100001")).toMatchObject({ used: true, orderId: "o1", orderNo: "#1001" });
  });

  it("rejects a code from another group, and a used code (same validation as coupons)", async () => {
    const { applyGiftVouchersToOrder } = await import("@/lib/gift-vouchers/order");
    const other = await applyGiftVouchersToOrder({ companyId: "co1", orderId: "o1", actorUserId: "u1", codes: ["COS14200002"] });
    expect(other).toMatchObject({ ok: false, status: 400 });
    expect(db.codes.find((c) => c.code === "COS14200002")!.used).toBe(false);

    db.codes[0].used = true;
    db.codes[0].orderNo = "999";
    const used = await applyGiftVouchersToOrder({ companyId: "co1", orderId: "o1", actorUserId: "u1", codes: ["COS14100001"] });
    expect(used).toMatchObject({ ok: false, status: 409 });
  });

  it("an order with neither a voucher coupon nor a voucher line item is refused", async () => {
    db.order!.lineItems = [{ price: 2500, sku: "CE019_1" }];
    const { applyGiftVouchersToOrder } = await import("@/lib/gift-vouchers/order");
    const result = await applyGiftVouchersToOrder({ companyId: "co1", orderId: "o1", actorUserId: "u1", codes: ["COS14100001"] });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("suggests only the matching group's codes", async () => {
    const { suggestGiftVoucherCodes } = await import("@/lib/gift-vouchers/order");
    const rows = await suggestGiftVoucherCodes({ companyId: "co1", orderId: "o1", query: "COS14" });
    expect(rows.map((r) => r.code)).toEqual(["COS14100001"]);
  });

  it("coupons still work, and both triggers together allow both groups", async () => {
    db.order = { discountCodes: [{ code: "SGV 500", amount: "500", type: "fixed_amount" }], lineItems: [{ price: -1000, sku: "NGV1000" }] };
    const { getOrderGiftVoucherState, suggestGiftVoucherCodes } = await import("@/lib/gift-vouchers/order");
    const state = await getOrderGiftVoucherState({ companyId: "co1", orderId: "o1", canApply: true });
    expect(state?.matchedCoupons).toEqual(["SGV 500", "NGV1000"]);
    const rows = await suggestGiftVoucherCodes({ companyId: "co1", orderId: "o1", query: "COS14" });
    expect(rows.map((r) => r.code).sort()).toEqual(["COS14100001", "COS14200002"]);
  });
});
