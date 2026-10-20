import { describe, expect, it } from "vitest";

import { isMismatchTransfer } from "@/lib/material-transfer/mismatch";

describe("isMismatchTransfer", () => {
  it("is true only for a finished transfer with a differing line", () => {
    expect(
      isMismatchTransfer({
        status: "received",
        lines: [
          { sentQty: 3, receivedQty: 3 },
          { sentQty: 3, receivedQty: 2 },
        ],
      }),
    ).toBe(true);
    expect(
      isMismatchTransfer({
        status: "confirmed",
        lines: [{ sentQty: 3, receivedQty: 4 }],
      }),
    ).toBe(true);
  });

  it("is false while the transfer is still open", () => {
    const lines = [{ sentQty: 3, receivedQty: 0 }];
    expect(isMismatchTransfer({ status: "sent", lines })).toBe(false);
    expect(isMismatchTransfer({ status: "requested", lines })).toBe(false);
  });

  it("is false when a finished transfer matches on every line", () => {
    expect(
      isMismatchTransfer({
        status: "received",
        lines: [{ sentQty: 3, receivedQty: 3 }],
      }),
    ).toBe(false);
  });
});
