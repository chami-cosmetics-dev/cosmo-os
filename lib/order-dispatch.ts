/** Select value for in-store customer pickup dispatch. */
export const DISPATCH_CUSTOMER_PICKUP = "customer:pickup";

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
