import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    orderWaybill: {
      findMany: mocks.findMany,
      update: mocks.update,
    },
  },
}));

import {
  applyCitypakPushUpdate,
  findWaybillsForCitypakPush,
} from "@/lib/citypak-waybill-status";

const deliveredPush = {
  tracking_number: "D16647924",
  reference: "110-000764",
  item_id: 16647924,
  status_type: "DL",
  status: "DELIVERED",
  delivered_datetime: "09-09-2026 15:44:36",
};

describe("findWaybillsForCitypakPush", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.update.mockReset();
  });

  it("matches any source by tracking number", async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: "wb1", waybillNo: "D16647924", rawPayload: {} },
    ]);

    const rows = await findWaybillsForCitypakPush({
      trackingNumber: "D16647924",
      reference: "110-000764",
    });

    expect(rows).toHaveLength(1);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ waybillNo: "D16647924" }),
      })
    );
    expect(mocks.findMany.mock.calls[0][0].where.source).toBeUndefined();
  });

  it("falls back to invoice reference for Falcon/manual rows", async () => {
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "wb-manual", waybillNo: "", rawPayload: { manual: true } },
      ]);

    const rows = await findWaybillsForCitypakPush({
      trackingNumber: "D16647924",
      reference: "110-000764",
    });

    expect(rows).toEqual([
      { id: "wb-manual", waybillNo: "", rawPayload: { manual: true } },
    ]);
    expect(mocks.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          invoiceNumber: { in: expect.arrayContaining(["110-000764"]) },
        }),
      })
    );
  });

  it("skips ambiguous multi-waybill invoices when tracking does not match", async () => {
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "a", waybillNo: "D111", rawPayload: {} },
        { id: "b", waybillNo: "D222", rawPayload: {} },
      ]);

    const rows = await findWaybillsForCitypakPush({
      trackingNumber: "D16647924",
      reference: "110-000764",
    });

    expect(rows).toEqual([]);
  });
});

describe("applyCitypakPushUpdate", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({});
  });

  it("stamps delivered status and backfills empty waybillNo from tracking", async () => {
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "wb-old", waybillNo: "  ", rawPayload: { sourceNote: "falcon" } },
      ]);

    const result = await applyCitypakPushUpdate({ payload: deliveredPush });

    expect(result).toEqual({ ok: true, matched: 1, status: "delivered" });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wb-old" },
        data: expect.objectContaining({
          waybillNo: "D16647924",
          rawPayload: expect.objectContaining({
            citypakStatus: "delivered",
            citypakStatusLabel: "Delivered",
          }),
        }),
      })
    );
  });

  it("returns ok:false when nothing matches tracking or reference", async () => {
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await applyCitypakPushUpdate({ payload: deliveredPush });

    expect(result).toEqual({
      ok: false,
      error: "No Cosmo waybill for tracking number D16647924 / reference 110-000764",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
