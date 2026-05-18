import { prisma } from "@/lib/prisma";

export type DeliveryCourierRow = {
  name: string;
  completedCount: number;
  pendingCount: number;
  completedValue: number; // sum of totalPrice for completed orders
  pendingValue: number; // sum of totalPrice for pending orders
};

export type DeliverySummaryResult = {
  couriers: DeliveryCourierRow[];
  invalidRange: boolean;
};

const DIRECT_DELIVERY_LABEL = "Delivered To Customer";

export async function fetchDashboardDeliverySummary(
  companyId: string | null,
  from: string,
  to: string,
): Promise<DeliverySummaryResult> {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
    return { couriers: [], invalidRange: true };
  }

  // Cover the full day range in UTC (dates are stored as UTC)
  const startOfFrom = new Date(fromDate);
  startOfFrom.setUTCHours(0, 0, 0, 0);
  const endOfTo = new Date(toDate);
  endOfTo.setUTCHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      dispatchedAt: {
        gte: startOfFrom,
        lte: endOfTo,
      },
    },
    select: {
      id: true,
      totalPrice: true,
      deliveryCompleteAt: true,
      dispatchedByRiderId: true,
      dispatchedByCourierServiceId: true,
      dispatchedByRider: {
        select: {
          name: true,
          knownName: true,
        },
      },
      dispatchedByCourierService: {
        select: {
          name: true,
        },
      },
    },
  });

  // Aggregate into a map keyed by courier name
  const map = new Map<string, DeliveryCourierRow>();

  function getRow(name: string): DeliveryCourierRow {
    if (!map.has(name)) {
      map.set(name, {
        name,
        completedCount: 0,
        pendingCount: 0,
        completedValue: 0,
        pendingValue: 0,
      });
    }
    return map.get(name)!;
  }

  for (const order of orders) {
    // Determine courier name
    let courierName: string;
    if (order.dispatchedByRider) {
      courierName = order.dispatchedByRider.knownName ?? order.dispatchedByRider.name ?? "Unknown Rider";
    } else if (order.dispatchedByCourierService) {
      courierName = order.dispatchedByCourierService.name;
    } else {
      courierName = DIRECT_DELIVERY_LABEL;
    }

    const isCompleted = order.deliveryCompleteAt !== null;
    const value = Number(order.totalPrice);
    const row = getRow(courierName);

    if (isCompleted) {
      row.completedCount += 1;
      row.completedValue += value;
    } else {
      row.pendingCount += 1;
      row.pendingValue += value;
    }
  }

  // Sort: by total (completed + pending) descending
  const couriers = [...map.values()].sort(
    (a, b) =>
      b.completedCount + b.pendingCount - (a.completedCount + a.pendingCount),
  );

  return { couriers, invalidRange: false };
}
