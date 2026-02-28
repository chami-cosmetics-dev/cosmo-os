import type { getCurrentUserContext } from "@/lib/rbac";
import { hasPermission } from "@/lib/rbac";

export type FulfillmentPermissions = {
  canManageSampleFreeIssue: boolean;
  canPrint: boolean;
  canPutOnHold: boolean;
  canMarkReady: boolean;
  canRevertHold: boolean;
  canDispatch: boolean;
  canMarkDelivered: boolean;
  canMarkInvoiceComplete: boolean;
  canManageRemarks: boolean;
  canResendRiderSms: boolean;
};

export const FULFILLMENT_STAGE_ORDER = [
  "order_received",
  "sample_free_issue",
  "print",
  "ready_to_dispatch",
  "dispatched",
  "delivery_complete",
  "invoice_complete",
] as const;

function stageToPermissionKey(stage: string): string {
  return stage === "ready_to_dispatch" ? "ready_dispatch" : stage;
}

/**
 * Returns revert permission keys the user has (fulfillment.revert_to.*).
 * Pass this serializable array to client components instead of a function.
 */
export function getRevertPermissionKeys(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>
): string[] {
  if (!context) return [];
  const keys = context.permissionKeys as string[];
  return keys.filter((k) => k.startsWith("fulfillment.revert_to."));
}

/**
 * Client-safe: builds canRevertToStage checker from permission keys.
 * Cascading: user must have permission for target AND every stage between target and current.
 */
export function createCanRevertToStageFromKeys(
  revertPermissionKeys: string[]
): (targetStage: string, currentStage: string) => boolean {
  if (!revertPermissionKeys || revertPermissionKeys.length === 0) {
    return () => false;
  }
  const hasPerm = (stage: string) =>
    revertPermissionKeys.includes(
      `fulfillment.revert_to.${stageToPermissionKey(stage)}`
    );
  return (target: string, current: string) => {
    const ti = FULFILLMENT_STAGE_ORDER.indexOf(target as (typeof FULFILLMENT_STAGE_ORDER)[number]);
    const ci = FULFILLMENT_STAGE_ORDER.indexOf(current as (typeof FULFILLMENT_STAGE_ORDER)[number]);
    if (ti >= ci || ti < 0 || ci < 0) return false;
    for (let i = ti; i < ci; i++) {
      if (!hasPerm(FULFILLMENT_STAGE_ORDER[i])) return false;
    }
    return true;
  };
}

export function buildFulfillmentPermissions(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>
): FulfillmentPermissions {
  if (!context) {
    return {
      canManageSampleFreeIssue: false,
      canPrint: false,
      canPutOnHold: false,
      canMarkReady: false,
      canRevertHold: false,
      canDispatch: false,
      canMarkDelivered: false,
      canMarkInvoiceComplete: false,
      canManageRemarks: false,
      canResendRiderSms: false,
    };
  }
  return {
    canManageSampleFreeIssue:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.sample_free_issue.manage"),
    canPrint:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.order_print.print"),
    canPutOnHold:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.ready_dispatch.put_on_hold"),
    canMarkReady:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.ready_dispatch.package_ready"),
    canRevertHold:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.ready_dispatch.revert_hold"),
    canDispatch:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.ready_dispatch.dispatch"),
    canMarkDelivered:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.delivery_invoice.mark_delivered"),
    canMarkInvoiceComplete:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.delivery_invoice.mark_complete"),
    canManageRemarks:
      hasPermission(context, "orders.manage") ||
      hasPermission(context, "fulfillment.remarks.manage"),
    canResendRiderSms: hasPermission(context, "orders.manage"),
  };
}

export type FulfillmentNavPermissions = {
  canViewSampleFreeIssue: boolean;
  canViewOrderPrint: boolean;
  canViewReadyDispatch: boolean;
  canViewDeliveryInvoice: boolean;
};

export function buildFulfillmentNavPermissions(
  context: Awaited<ReturnType<typeof getCurrentUserContext>>
): FulfillmentNavPermissions {
  if (!context) {
    return {
      canViewSampleFreeIssue: false,
      canViewOrderPrint: false,
      canViewReadyDispatch: false,
      canViewDeliveryInvoice: false,
    };
  }
  return {
    canViewSampleFreeIssue:
      hasPermission(context, "orders.read") ||
      hasPermission(context, "fulfillment.sample_free_issue.read"),
    canViewOrderPrint:
      hasPermission(context, "orders.read") ||
      hasPermission(context, "fulfillment.order_print.read"),
    canViewReadyDispatch:
      hasPermission(context, "orders.read") ||
      hasPermission(context, "fulfillment.ready_dispatch.read"),
    canViewDeliveryInvoice:
      hasPermission(context, "orders.read") ||
      hasPermission(context, "fulfillment.delivery_invoice.read"),
  };
}
