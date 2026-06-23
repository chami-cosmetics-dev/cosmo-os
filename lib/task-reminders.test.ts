import { describe, expect, it } from "vitest";

import {
  hasReminderPermission,
  isTaskReminderOverdue,
  TASK_REMINDER_SLA_MS,
} from "@/lib/task-reminders";

describe("isTaskReminderOverdue", () => {
  const now = new Date("2026-06-22T12:00:00Z");

  it("returns false under 24 hours", () => {
    const since = new Date(now.getTime() - TASK_REMINDER_SLA_MS + 60_000);
    expect(isTaskReminderOverdue(since, now)).toBe(false);
  });

  it("returns true at 24 hours", () => {
    const since = new Date(now.getTime() - TASK_REMINDER_SLA_MS);
    expect(isTaskReminderOverdue(since, now)).toBe(true);
  });

  it("returns false when since is missing", () => {
    expect(isTaskReminderOverdue(null, now)).toBe(false);
  });
});

describe("hasReminderPermission", () => {
  it("allows admin roles", () => {
    expect(
      hasReminderPermission(
        { permissionKeys: [], roleNames: ["admin"] },
        "finance.approvals.manage",
      ),
    ).toBe(true);
  });

  it("checks explicit permission", () => {
    expect(
      hasReminderPermission(
        { permissionKeys: ["fulfillment.order_print.read"], roleNames: [] },
        "fulfillment.order_print.read",
      ),
    ).toBe(true);
    expect(
      hasReminderPermission(
        { permissionKeys: ["fulfillment.order_print.read"], roleNames: [] },
        "finance.approvals.manage",
      ),
    ).toBe(false);
  });
});
