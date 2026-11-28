import { describe, expect, it } from "vitest";

import {
  TASK_REMINDER_ORDER_ID_PARAM,
  TASK_REMINDER_WAYBILL_ID_PARAM,
  taskReminderHref,
} from "@/lib/task-reminder-links";

describe("taskReminderHref", () => {
  it("builds waybill deep-link for City Pack Delivery Failed", () => {
    expect(
      taskReminderHref("/dashboard/fulfillment/waybill-lookup", {
        waybillId: "wb-1",
        orderId: "ord-1",
      }),
    ).toBe(
      `/dashboard/fulfillment/waybill-lookup?${TASK_REMINDER_ORDER_ID_PARAM}=ord-1&${TASK_REMINDER_WAYBILL_ID_PARAM}=wb-1`,
    );
  });

  it("omits empty opts", () => {
    expect(taskReminderHref("/dashboard/merchant")).toBe("/dashboard/merchant");
  });
});
