import { describe, expect, it } from "vitest";

import {
  canSeeTaskReminderCategory,
  resolveTaskReminderAudiences,
  shouldScopeSampleRemindersToMerchant,
} from "@/lib/task-reminder-access";

describe("task-reminder-access", () => {
  it("gives admins all audiences", () => {
    const audiences = resolveTaskReminderAudiences({
      roleNames: ["admin"],
      permissionKeys: [],
    });
    expect(audiences).toEqual(new Set(["admin"]));
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: ["finance.approvals.manage"] },
        "finance_approval",
      ),
    ).toBe(true);
    expect(
      canSeeTaskReminderCategory(
        {
          roleNames: ["admin"],
          permissionKeys: ["fulfillment.ready_dispatch.read"],
        },
        "ready_dispatch",
      ),
    ).toBe(true);
  });

  it("limits finance users to finance reminders", () => {
    const context = {
      roleNames: ["finance"],
      permissionKeys: ["finance.approvals.manage", "orders.read"],
    };
    expect(resolveTaskReminderAudiences(context)).toEqual(new Set(["finance"]));
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "add_samples")).toBe(false);
  });

  it("limits store users to store pipeline reminders", () => {
    const context = {
      roleNames: ["store"],
      permissionKeys: [
        "fulfillment.ready_dispatch.read",
        "fulfillment.order_print.read",
        "returns.read",
      ],
    };
    expect(resolveTaskReminderAudiences(context)).toEqual(new Set(["store"]));
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "print")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "return_action")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "add_samples")).toBe(false);
  });

  it("limits merchants to sample reminders only", () => {
    const context = {
      roleNames: ["merchant"],
      permissionKeys: [
        "fulfillment.sample_free_issue.read",
        "fulfillment.sample_free_issue.manage",
      ],
    };
    expect(resolveTaskReminderAudiences(context)).toEqual(new Set(["merchant"]));
    expect(canSeeTaskReminderCategory(context, "add_samples")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(false);
    expect(shouldScopeSampleRemindersToMerchant(context)).toBe(true);
  });

  it("does not scope samples for store users", () => {
    const context = {
      roleNames: ["store"],
      permissionKeys: ["fulfillment.sample_free_issue.read", "fulfillment.ready_dispatch.read"],
    };
    expect(shouldScopeSampleRemindersToMerchant(context)).toBe(false);
  });
});
