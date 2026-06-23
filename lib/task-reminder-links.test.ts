import { describe, expect, it } from "vitest";

import { taskReminderHref } from "@/lib/task-reminder-links";

describe("taskReminderHref", () => {
  it("returns path unchanged when no params", () => {
    expect(taskReminderHref("/dashboard/fulfillment/print")).toBe(
      "/dashboard/fulfillment/print",
    );
  });

  it("appends orderId query param", () => {
    expect(
      taskReminderHref("/dashboard/fulfillment/sample-free-issue", {
        orderId: "clxyz123",
      }),
    ).toBe("/dashboard/fulfillment/sample-free-issue?orderId=clxyz123");
  });

  it("appends orderId and queue for rearrange dispatch", () => {
    expect(
      taskReminderHref("/dashboard/fulfillment/dispatch", {
        orderId: "clxyz123",
        queue: "rearrange",
      }),
    ).toBe("/dashboard/fulfillment/dispatch?orderId=clxyz123&queue=rearrange");
  });
});
