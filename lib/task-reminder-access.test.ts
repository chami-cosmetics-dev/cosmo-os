import { describe, expect, it } from "vitest";

import {
  canSeeTaskReminderCategory,
  listVisibleTaskReminderCategories,
  resolveTaskReminderAudiences,
  shouldScopeSampleRemindersToMerchant,
} from "@/lib/task-reminder-access";

describe("task-reminder-access", () => {
  it("gives admins all reminder bubbles via role bypass", () => {
    const audiences = resolveTaskReminderAudiences({
      roleNames: ["admin"],
      permissionKeys: [],
    });
    expect(audiences).toEqual(new Set(["admin"]));
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: [] },
        "finance_approval",
      ),
    ).toBe(true);
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: [] },
        "ready_dispatch",
      ),
    ).toBe(true);
  });

  it("shows finance bubble only when reminders.finance_approval is granted", () => {
    const withReminder = {
      roleNames: ["finance"],
      permissionKeys: ["reminders.finance_approval", "finance.approvals.manage"],
    };
    expect(canSeeTaskReminderCategory(withReminder, "finance_approval")).toBe(true);
    expect(canSeeTaskReminderCategory(withReminder, "ready_dispatch")).toBe(false);

    const withoutReminder = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "fulfillment.ready_dispatch.read",
        "returns.read",
      ],
    };
    expect(canSeeTaskReminderCategory(withoutReminder, "finance_approval")).toBe(false);
    expect(canSeeTaskReminderCategory(withoutReminder, "ready_dispatch")).toBe(false);
  });

  it("allows selecting individual store bubbles via reminders.*", () => {
    const context = {
      roleNames: ["store"],
      permissionKeys: ["reminders.print", "reminders.ready_dispatch"],
    };
    expect(canSeeTaskReminderCategory(context, "print")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "rearrange_dispatch")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "return_action")).toBe(false);
    expect(listVisibleTaskReminderCategories(context)).toEqual(["print", "ready_dispatch"]);
  });

  it("limits merchants to samples when they have reminders.add_samples", () => {
    const context = {
      roleNames: ["merchant"],
      permissionKeys: [
        "reminders.add_samples",
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
      permissionKeys: [
        "reminders.add_samples",
        "fulfillment.sample_free_issue.read",
        "fulfillment.ready_dispatch.read",
      ],
    };
    expect(shouldScopeSampleRemindersToMerchant(context)).toBe(false);
  });

  it("lists only categories granted by reminders.*", () => {
    const financeContext = {
      roleNames: ["finance"],
      permissionKeys: ["reminders.finance_approval", "fulfillment.order_print.read"],
    };
    expect(listVisibleTaskReminderCategories(financeContext)).toEqual(["finance_approval"]);

    const mixedContext = {
      roleNames: ["custom_ops"],
      permissionKeys: [
        "reminders.print",
        "reminders.rearrange_dispatch",
        "reminders.return_action",
      ],
    };
    expect(listVisibleTaskReminderCategories(mixedContext)).toEqual([
      "print",
      "rearrange_dispatch",
      "return_action",
    ]);
  });
});
