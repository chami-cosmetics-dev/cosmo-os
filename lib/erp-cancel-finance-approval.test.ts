import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approvalFindFirst: vi.fn(),
  approvalUpdateMany: vi.fn(),
  orderFindFirst: vi.fn(),
  orderUpdate: vi.fn(),
  orderReturnUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    approvalRequest: {
      findFirst: mocks.approvalFindFirst,
      updateMany: mocks.approvalUpdateMany,
    },
    order: {
      findFirst: mocks.orderFindFirst,
      update: mocks.orderUpdate,
    },
    orderReturn: {
      updateMany: mocks.orderReturnUpdateMany,
    },
  },
}));

import { applyErpCancelToOriginalOrder } from "@/lib/erp-credit-note-order-sync";

describe("applyErpCancelToOriginalOrder", () => {
  beforeEach(() => {
    mocks.approvalFindFirst.mockReset();
    mocks.approvalUpdateMany.mockReset();
    mocks.orderFindFirst.mockReset();
    mocks.orderUpdate.mockReset();
    mocks.orderReturnUpdateMany.mockReset();
    mocks.approvalUpdateMany.mockResolvedValue({ count: 0 });
    mocks.orderReturnUpdateMany.mockResolvedValue({ count: 0 });
    mocks.orderUpdate.mockResolvedValue({});
  });

  it("voids OS and closes finance cancel when ERP already cancelled", async () => {
    mocks.orderFindFirst.mockResolvedValue({
      id: "ord_erp1",
      name: "60020100",
      financialStatus: "pending",
      fulfillmentStage: "returned_to_store",
      cancelledAt: null,
      cancelReason: null,
    });

    const result = await applyErpCancelToOriginalOrder("600-006012");

    expect(result?.id).toBe("ord_erp1");
    expect(mocks.orderUpdate).toHaveBeenCalledOnce();
    expect(mocks.orderUpdate.mock.calls[0][0].data.financialStatus).toBe("voided");
    expect(mocks.orderUpdate.mock.calls[0][0].data.cancelReason).toBe("ERP cancel");
    expect(mocks.approvalUpdateMany).toHaveBeenCalled();
    expect(mocks.approvalUpdateMany.mock.calls[0][0].where).not.toHaveProperty("type");
    expect(mocks.orderReturnUpdateMany).toHaveBeenCalledWith({
      where: { orderId: "ord_erp1", actionStatus: "pending" },
      data: expect.objectContaining({ actionStatus: "solved" }),
    });
  });

  it("voids the order when finance has no pending cancel", async () => {
    mocks.orderFindFirst.mockResolvedValue({
      id: "ord_manual",
      name: "60019980",
      financialStatus: "pending",
      fulfillmentStage: "returned_to_store",
      cancelledAt: null,
      cancelReason: null,
    });

    await applyErpCancelToOriginalOrder("600-005759");

    expect(mocks.orderUpdate).toHaveBeenCalledOnce();
    expect(mocks.orderUpdate.mock.calls[0][0].data.financialStatus).toBe("voided");
    expect(mocks.orderUpdate.mock.calls[0][0].data.cancelReason).toBe("ERP cancel");
    expect(mocks.approvalUpdateMany).toHaveBeenCalled();
  });
});
