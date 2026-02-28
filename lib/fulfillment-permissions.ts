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
