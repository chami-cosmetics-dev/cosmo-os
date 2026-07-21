import { describe, expect, it } from "vitest";

import {
  canSeeTaskReminderCategory,
  listVisibleTaskReminderCategories,
  resolveTaskReminderAudiences,
  shouldScopeSampleRemindersToMerchant,
} from "@/lib/task-reminder-access";

describe("task-reminder-access", () => {
  it("requires explicit reminders.* even for admins (no page-perm default)", () => {
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: ["fulfillment.ready_dispatch.read"] },
        "ready_dispatch",
      ),
    ).toBe(false);
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: ["reminders.finance_approval"] },
        "finance_approval",
      ),
    ).toBe(true);
  });

  it("keeps finance → finance bubble only with reminders.* (page perm alone is not enough)", () => {
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
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(false);
  });

  it("grants finance bubble from reminders.finance_approval", () => {
    const context = {
      roleNames: ["hod"],
      permissionKeys: [
        "finance.approvals.read",
        "finance.hod.revert_paid_to_unpaid",
        "reminders.finance_approval",
      ],
    };
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
  });

  it("grants invoice complete bubble to finance via reminders.invoice_complete", () => {
    const context = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "fulfillment.invoice_complete.read",
        "reminders.finance_approval",
        "reminders.invoice_complete",
      ],
    };
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "invoice_complete")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "delivery_pending")).toBe(false);
  });

  it("grants invoice complete bubble from reminders.* for store/admin audience", () => {
    expect(
      canSeeTaskReminderCategory(
        {
          roleNames: ["store"],
          permissionKeys: [
            "fulfillment.invoice_complete.read",
            "fulfillment.ready_dispatch.read",
            "reminders.invoice_complete",
          ],
        },
        "invoice_complete",
      ),
    ).toBe(true);
  });

  it("does not let finance reminders.* unlock store bubbles", () => {
    const context = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "reminders.finance_approval",
        "reminders.delivery_pending",
        "reminders.print",
        "reminders.ready_dispatch",
      ],
    };
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "delivery_pending")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "print")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(false);
  });

  it("shows purchasing ROP threshold bubble with explicit reminders.* only", () => {
    const context = {
      roleNames: ["admin"],
      permissionKeys: ["reminders.purchasing_rop_threshold"],
    };
    expect(canSeeTaskReminderCategory(context, "purchasing_rop_threshold")).toBe(true);
    expect(
      canSeeTaskReminderCategory(
        { roleNames: ["admin"], permissionKeys: [] },
        "purchasing_rop_threshold",
      ),
    ).toBe(false);
  });

  it("does not let store reminders.* unlock finance bubbles", () => {
    const context = {
      roleNames: ["store"],
      permissionKeys: [
        "fulfillment.order_print.read",
        "reminders.finance_approval",
        "reminders.add_samples",
        "reminders.print",
      ],
    };
    expect(canSeeTaskReminderCategory(context, "print")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "add_samples")).toBe(false);
  });

  it("limits store users to store pipeline via explicit reminders.*", () => {
    const context = {
      roleNames: ["store"],
      permissionKeys: [
        "fulfillment.ready_dispatch.read",
        "fulfillment.order_print.read",
        "returns.read",
        "reminders.ready_dispatch",
        "reminders.print",
        "reminders.return_action",
      ],
    };
    expect(resolveTaskReminderAudiences(context)).toEqual(new Set(["store"]));
    expect(canSeeTaskReminderCategory(context, "ready_dispatch")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "print")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "return_action")).toBe(true);
    expect(canSeeTaskReminderCategory(context, "finance_approval")).toBe(false);
    expect(canSeeTaskReminderCategory(context, "add_samples")).toBe(false);
  });

  it("limits merchants to sample reminders via reminders.add_samples", () => {
    const context = {
      roleNames: ["merchant"],
      permissionKeys: [
        "fulfillment.sample_free_issue.read",
        "fulfillment.sample_free_issue.manage",
        "reminders.add_samples",
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

  it("lists categories from reminders.* within audience caps", () => {
    const financeContext = {
      roleNames: ["finance"],
      permissionKeys: [
        "finance.approvals.manage",
        "fulfillment.invoice_complete.read",
        "fulfillment.order_print.read",
        "reminders.finance_approval",
        "reminders.invoice_complete",
        "reminders.print",
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
        "reminders.print",
        "reminders.ready_dispatch",
        "reminders.return_action",
        "reminders.finance_approval",
      ],
    };
    expect(listVisibleTaskReminderCategories(storeContext)).toEqual([
      "print",
      "ready_dispatch",
      "return_action",
    ]);
  });
});
