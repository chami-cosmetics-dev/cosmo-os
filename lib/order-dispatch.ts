/** Select value for in-store customer pickup dispatch. */
export const DISPATCH_CUSTOMER_PICKUP = "customer:pickup";

/** When false, Invoice Completed is hidden on order detail views until re-enabled. */
export const SHOW_INVOICE_COMPLETED_IN_ORDER_DETAILS = true;

export type DispatchServiceSelection =
  | { type: "rider"; id: string }
  | { type: "courier"; id: string }
  | { type: "customer" };

export function parseDispatchService(value: string): DispatchServiceSelection | null {
  if (!value) return null;
  if (value === DISPATCH_CUSTOMER_PICKUP) return { type: "customer" };
  if (value.startsWith("rider:")) {
    const id = value.slice("rider:".length);
    return id ? { type: "rider", id } : null;
  }
  if (value.startsWith("courier:")) {
    const id = value.slice("courier:".length);
    return id ? { type: "courier", id } : null;
  }
  return null;
}

export function dispatchSelectionToApiBody(selection: DispatchServiceSelection): {
  riderId?: string;
  courierServiceId?: string;
  dispatchToCustomer?: boolean;
} {
  if (selection.type === "rider") return { riderId: selection.id };
  if (selection.type === "courier") return { courierServiceId: selection.id };
  return { dispatchToCustomer: true };
}

export function getOrderDispatchLabel(order: {
  dispatchedToCustomer?: boolean | null;
  dispatchedByRider?: { name: string | null; mobile?: string | null } | null;
  dispatchedByCourierService?: { name: string } | null;
}): string {
  if (order.dispatchedToCustomer) return "Customer pickup";
  if (order.dispatchedByRider) {
    return order.dispatchedByRider.name ?? order.dispatchedByRider.mobile ?? "Rider";
  }
  if (order.dispatchedByCourierService) return order.dispatchedByCourierService.name;
  return "—";
}

type UserLabel = { name?: string | null; email?: string | null } | null | undefined;

function userDisplayName(user: UserLabel): string | null {
  if (!user) return null;
  return user.name?.trim() || user.email?.trim() || null;
}

/** Delivered row: only show courier/store after delivery is marked. */
export function formatDeliveredTimelineWho(params: {
  deliveryCompleteAt: string | null | undefined;
  deliveryCompleteBy: UserLabel;
  dispatchLabel: string;
}): string {
  if (!params.deliveryCompleteAt) return "-";
  const markedBy = userDisplayName(params.deliveryCompleteBy);
  const dispatch = params.dispatchLabel !== "—" ? params.dispatchLabel : null;
  if (dispatch && markedBy) return `${dispatch} · marked by ${markedBy}`;
  return markedBy ?? dispatch ?? "-";
}

/** Invoice complete row: finance approver when payment was confirmed after delivery. */
export function formatInvoiceCompleteTimelineWho(params: {
  invoiceCompleteBy: UserLabel;
  deliveryPaymentApproval?: {
    status?: string;
    reviewedBy?: UserLabel;
  } | null;
}): string {
  const fromOrder = userDisplayName(params.invoiceCompleteBy);
  if (fromOrder) return fromOrder;
  if (
    params.deliveryPaymentApproval?.status === "approved" &&
    params.deliveryPaymentApproval.reviewedBy
  ) {
    return userDisplayName(params.deliveryPaymentApproval.reviewedBy) ?? "-";
  }
  return "-";
}
