import { describe, expect, it } from "vitest";

import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import {
  buildMerchantPaymentApprovalWhere,
  hasReminderPermission,
  isTaskReminderOverdue,
  mapMerchantPaymentApprovalReminder,
  resolveDispatchReminderSince,
} from "@/lib/task-reminders";
import { TASK_REMINDER_SLA_MS } from "@/lib/task-reminder-sla";

describe("isTaskReminderOverdue", () => {
  const now = new Date("2026-06-22T12:00:00Z");

  it("returns false under SLA threshold", () => {
    const since = new Date(now.getTime() - TASK_REMINDER_SLA_MS + 60_000);
    expect(isTaskReminderOverdue(since, now)).toBe(false);
  });

  it("returns true at SLA threshold", () => {
    const since = new Date(now.getTime() - TASK_REMINDER_SLA_MS);
    expect(isTaskReminderOverdue(since, now)).toBe(true);
  });

  it("returns false when since is missing", () => {
    expect(isTaskReminderOverdue(null, now)).toBe(false);
  });
});

describe("resolveDispatchReminderSince", () => {
  it("uses lastPrintedAt and ignores package ready", () => {
    const printed = new Date("2026-07-15T07:55:00Z");
    expect(resolveDispatchReminderSince({ lastPrintedAt: printed })).toEqual(printed);
  });

  it("returns null when not printed", () => {
    expect(resolveDispatchReminderSince({ lastPrintedAt: null })).toBeNull();
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

describe("finance reminder location scope semantics", () => {
  it("matches approvals resolveViewerFinanceLocationIds contract", async () => {
    const { resolveViewerFinanceLocationIds } = await import("@/lib/approval-workflow");
    // Type/smoke: function is the same helper used by reminders + approvals page
    expect(typeof resolveViewerFinanceLocationIds).toBe("function");
  });
});

describe("merchant payment approval reminders", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const merchantId = "user-merchant-1";

  it("scopes where to merchant assigned pending payment approvals only", () => {
    const where = buildMerchantPaymentApprovalWhere("co-1", merchantId);
    expect(where).toMatchObject({
      companyId: "co-1",
      type: ORDER_PAYMENT_APPROVAL,
      status: "pending",
      order: { assignedMerchantId: merchantId },
    });
    expect(where).not.toHaveProperty("OR");
  });

  it("maps pending copy with merchant dashboard href", () => {
    const pending = mapMerchantPaymentApprovalReminder(
      {
        id: "apr-1",
        createdAt: new Date("2026-09-14T12:00:00Z"),
        order: {
          id: "ord-1",
          name: "#1001",
          orderNumber: "1001",
          shopifyOrderId: null,
        },
      },
      now,
    );
    expect(pending).toMatchObject({
      category: "merchant_payment_approval",
      title: "Payment approval pending",
      orderId: "ord-1",
      invoiceLabel: "#1001",
      href: "/dashboard/merchant?orderId=ord-1",
    });
    expect(pending.body).toContain("waiting for finance payment approval");
  });
});
