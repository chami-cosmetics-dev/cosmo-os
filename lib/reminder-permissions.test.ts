import { describe, expect, it } from "vitest";

import {
  isReminderImpliedByPagePermissions,
  stripImpliedReminderPermissions,
} from "@/lib/reminder-permissions";

describe("reminder-permissions helpers", () => {
  it("implies finance reminder from finance.approvals.read or manage", () => {
    expect(
      isReminderImpliedByPagePermissions("reminders.finance_approval", [
        "finance.approvals.read",
      ]),
    ).toBe(true);
    expect(
      isReminderImpliedByPagePermissions("reminders.finance_approval", [
        "finance.approvals.manage",
      ]),
    ).toBe(true);
    expect(
      isReminderImpliedByPagePermissions("reminders.finance_approval", [
        "orders.read",
      ]),
    ).toBe(false);
  });

  it("leaves non-implied extras selectable", () => {
    expect(
      isReminderImpliedByPagePermissions("reminders.print", [
        "finance.approvals.manage",
      ]),
    ).toBe(false);
  });

  it("strips implied reminders from saved permission keys", () => {
    expect(
      stripImpliedReminderPermissions([
        "finance.approvals.manage",
        "reminders.finance_approval",
        "reminders.print",
        "orders.read",
      ]),
    ).toEqual([
      "finance.approvals.manage",
      "reminders.print",
      "orders.read",
    ]);
  });
});
