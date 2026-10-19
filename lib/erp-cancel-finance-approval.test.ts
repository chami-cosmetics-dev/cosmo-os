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

  it("leaves OS alone while a return cancel is waiting on finance", async () => {
    mocks.orderFindFirst.mockResolvedValue({
      id: "ord_erp1",
      name: "60020100",
      financialStatus: "pending",
      fulfillmentStage: "returned_to_store",
      cancelledAt: null,
      cancelReason: null,
    });
    mocks.approvalFindFirst.mockResolvedValue({ id: "appr_return_cancel" });

    const result = await applyErpCancelToOriginalOrder("600-006012");

    expect(result?.id).toBe("ord_erp1");
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
    expect(mocks.approvalUpdateMany).not.toHaveBeenCalled();
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
    mocks.approvalFindFirst.mockResolvedValue(null);

    await applyErpCancelToOriginalOrder("600-005759");

    expect(mocks.orderUpdate).toHaveBeenCalledOnce();
    expect(mocks.orderUpdate.mock.calls[0][0].data.financialStatus).toBe("voided");
    expect(mocks.orderUpdate.mock.calls[0][0].data.cancelReason).toBe("ERP cancel");
    expect(mocks.approvalUpdateMany).toHaveBeenCalled();
  });
});
