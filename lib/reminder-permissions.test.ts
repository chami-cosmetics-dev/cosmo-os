import { describe, expect, it } from "vitest";

import {
  buildReminderBubblePermissionDescription,
  reminderPermissionForCategory,
} from "@/lib/reminder-permissions";

describe("reminder-permissions helpers", () => {
  it("maps category to reminders.* key", () => {
    expect(reminderPermissionForCategory("finance_approval")).toBe(
      "reminders.finance_approval",
    );
    expect(reminderPermissionForCategory("merchant_payment_approval")).toBe(
      "reminders.merchant_payment_approval",
    );
    expect(reminderPermissionForCategory("print")).toBe("reminders.print");
  });

  it("describes bubbles as explicit grants", () => {
    expect(buildReminderBubblePermissionDescription("finance_approval")).toBe(
      "Show Finance approvals reminder bubble (must be granted explicitly)",
    );
    expect(
      buildReminderBubblePermissionDescription("merchant_payment_approval"),
    ).toBe(
      "Show My payment approvals reminder bubble (must be granted explicitly)",
    );
  });
});
