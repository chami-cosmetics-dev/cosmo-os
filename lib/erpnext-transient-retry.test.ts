import { describe, expect, it, vi } from "vitest";

import { retryTransientErpOperation } from "@/lib/erpnext-transient-retry";

describe("retryTransientErpOperation", () => {
  it("returns on first success", async () => {
    const operation = vi.fn().mockResolvedValue("pe-1");
    await expect(retryTransientErpOperation("PE", operation, { delaysMs: [1, 1] })).resolves.toBe(
      "pe-1",
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries 502 then succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("ERPNext POST /api/resource/Payment Entry [502]: Bad Gateway"))
      .mockResolvedValue("pe-2");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryTransientErpOperation("PE", operation, { delaysMs: [5, 10], sleep }),
    ).resolves.toBe("pe-2");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it("retries deadlock then succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'ERPNext POST /api/resource/Payment Entry [500]: {"exception":"frappe.exceptions.QueryDeadlockError: (1213, \\"Deadlock found when trying to get lock; try restarting transaction\\")"}',
        ),
      )
      .mockResolvedValue("pe-3");

    await expect(
      retryTransientErpOperation("PE", operation, {
        delaysMs: [1],
        sleep: async () => undefined,
      }),
    ).resolves.toBe("pe-3");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry out of stock", async () => {
    const err = new Error("Out of stock - NW005-1");
    const operation = vi.fn().mockRejectedValue(err);

    await expect(
      retryTransientErpOperation("PE", operation, { delaysMs: [1, 1] }),
    ).rejects.toBe(err);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries for fetch failed", async () => {
    const err = new Error("fetch failed");
    const operation = vi.fn().mockRejectedValue(err);

    await expect(
      retryTransientErpOperation("PE", operation, {
        delaysMs: [1, 1],
        sleep: async () => undefined,
      }),
    ).rejects.toBe(err);
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
