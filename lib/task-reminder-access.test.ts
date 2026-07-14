import { describe, expect, it } from "vitest";

import {
  canSeeTaskReminderCategory,
  listVisibleTaskReminderCategories,
  resolveTaskReminderAudiences,
  shouldScopeSampleRemindersToMerchant,
} from "@/lib/task-reminder-access";

describe("task-reminder-access", () => {
  it("gives admins bubbles from page perms (legacy) and reminders.*", () => {
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: ["fulfillment.ready_dispatch.read"] },
        "ready_dispatch",
      ),
    ).toBe(true);
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: ["reminders.finance_approval"] },
        "finance_approval",
      ),
    ).toBe(true);
  });

  it("keeps finance → finance bubble via page perm without reminders.*", () => {
    const context = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "orders.read",
        "returns.read",
        "fulfillment.delivery_invoice.read",
        "fulfillment.ready_dispatch.read",
      ],
    };
    expect(resolveTaskReminderAudiences(context)).toEqual(new Set(["finance"]));
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
    // Audience still blocks store queues from page perms alone
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "delivery_pending")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "return_action")).toBe(false);
  });

  it("grants finance bubble from finance.approvals.read alone (e.g. HOD)", () => {
    const context = {
      roleNames: ["hod"],
      permissionKeys: ["finance.approvals.read", "finance.hod.revert_paid_to_unpaid"],
    };
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
  });

  it("grants invoice complete bubble to finance via invoice_complete.read", () => {
    const context = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "fulfillment.invoice_complete.read",
      ],
    };
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "invoice_complete")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "delivery_pending")).toBe(false);
  });

  it("grants invoice complete bubble from page perm for store/admin audience", () => {
    expect(
      canSeeTaskReminderCategory(
        {
          roleNames: ["store"],
          permissionKeys: ["fulfillment.invoice_complete.read", "fulfillment.ready_dispatch.read"],
        },
        "invoice_complete",
      ),
    ).toBe(true);
  });

  it("lets finance get extra bubbles via reminders.* even without store audience", () => {
    const context = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "reminders.delivery_pending",
        "reminders.print",
      ],
    };
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "delivery_pending")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "print")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(false);
  });

  it("limits store users to store pipeline via page perms", () => {
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

  it("limits merchants to sample reminders via page perm", () => {
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
      permissionKeys: [
        "fulfillment.sample_free_issue.read",
        "fulfillment.ready_dispatch.read",
      ],
    };
    expect(shouldScopeSampleRemindersToMerchant(context)).toBe(false);
  });

  it("lists categories from page perms and extra reminders.*", () => {
    const financeContext = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "fulfillment.invoice_complete.read",
        "fulfillment.order_print.read",
      ],
    };
    expect(listVisibleTaskReminderCategories(financeContext)).toEqual([
      "finance_approval",
      "invoice_complete",
    ]);

    const storeContext = {
      roleNames: ["store"],
      permissionKeys: [
        "fulfillment.ready_dispatch.read",
        "fulfillment.order_print.read",
        "returns.read",
      ],
    };
    expect(listVisibleTaskReminderCategories(storeContext)).toEqual([
      "print",
      "ready_dispatch",
      "rearrange_dispatch",
      "return_action",
    ]);
  });
});
