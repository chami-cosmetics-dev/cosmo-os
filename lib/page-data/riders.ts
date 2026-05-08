import { prisma } from "@/lib/prisma";

type RiderRosterItem = {
  id: string;
  name: string | null;
  knownName: string | null;
  email: string | null;
  mobile: string | null;
  status: string | null;
  locationName: string | null;
};

type RiderOrderRow = {
  taskId: string;
  orderId: string;
  orderLabel: string;
  orderNumber: string | null;
  shopifyOrderId: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  locationName: string | null;
  assignedAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  expectedAmount: string;
  collectedAmount: string | null;
  paymentMethod: string | null;
  collectionStatus: string | null;
};

type RiderLocationSummary = {
  locationName: string;
  orderCount: number;
  cashTotal: string;
  bankTransferTotal: string;
  cardTotal: string;
  alreadyPaidTotal: string;
  collectedTotal: string;
};

export type RiderOrdersData = {
  rider: RiderRosterItem | null;
  rows: RiderOrderRow[];
  statusSummary: {
    total: number;
    assigned: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
  locationSummary: RiderLocationSummary[];
};

function extractCustomerName(shippingAddress: unknown, billingAddress: unknown) {
  const candidate = [shippingAddress, billingAddress].find(
    (value) => value && typeof value === "object"
  ) as
    | {
        first_name?: string | null;
        last_name?: string | null;
        name?: string | null;
      }
    | undefined;

  if (!candidate) return null;
  const full = candidate.name?.trim();
  if (full) return full;
  const joined = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ").trim();
  return joined || null;
}

function toMoney(value: { toString(): string } | null | undefined) {
  return value?.toString() ?? "0.00";
}

export async function fetchRiderRoster(companyId: string | null): Promise<RiderRosterItem[]> {
  const riders = await prisma.user.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      employeeProfile: {
        is: {
          isRider: true,
        },
      },
    },
    select: {
      id: true,
      name: true,
      knownName: true,
      email: true,
      mobile: true,
      employeeProfile: {
        select: {
          status: true,
          location: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ employeeProfile: { status: "asc" } }, { name: "asc" }],
  });

  return riders.map((rider) => ({
    id: rider.id,
    name: rider.name,
    knownName: rider.knownName,
    email: rider.email,
    mobile: rider.mobile,
    status: rider.employeeProfile?.status ?? null,
    locationName: rider.employeeProfile?.location?.name ?? null,
  }));
}

export async function fetchRiderOrdersData(
  companyId: string | null,
  riderId: string
): Promise<RiderOrdersData> {
  const rider = await prisma.user.findFirst({
    where: {
      id: riderId,
      ...(companyId ? { companyId } : {}),
      employeeProfile: {
        is: {
          isRider: true,
        },
      },
    },
    select: {
      id: true,
      name: true,
      knownName: true,
      email: true,
      mobile: true,
      employeeProfile: {
        select: {
          status: true,
          location: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!rider) {
    return {
      rider: null,
      rows: [],
      statusSummary: { total: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0 },
      locationSummary: [],
    };
  }

  const tasks = await prisma.riderDeliveryTask.findMany({
    where: {
      riderId,
      ...(companyId ? { order: { is: { companyId } } } : {}),
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          name: true,
          shopifyOrderId: true,
          customerPhone: true,
          shippingAddress: true,
          billingAddress: true,
          companyLocation: {
            select: {
              name: true,
            },
          },
          deliveryPayment: {
            select: {
              expectedAmount: true,
              collectedAmount: true,
              paymentMethod: true,
              collectionStatus: true,
            },
          },
        },
      },
    },
    orderBy: [{ assignedAt: "desc" }],
  });

  const rows: RiderOrderRow[] = tasks.map((task) => ({
    taskId: task.id,
    orderId: task.order.id,
    orderLabel: task.order.name ?? task.order.orderNumber ?? task.order.shopifyOrderId,
    orderNumber: task.order.orderNumber,
    shopifyOrderId: task.order.shopifyOrderId,
    status: task.status,
    customerName: extractCustomerName(task.order.shippingAddress, task.order.billingAddress),
    customerPhone: task.order.customerPhone,
    locationName: task.order.companyLocation?.name ?? null,
    assignedAt: task.assignedAt.toISOString(),
    acceptedAt: task.acceptedAt?.toISOString() ?? null,
    arrivedAt: task.arrivedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    failedAt: task.failedAt?.toISOString() ?? null,
    expectedAmount: toMoney(task.order.deliveryPayment?.expectedAmount),
    collectedAmount: task.order.deliveryPayment ? toMoney(task.order.deliveryPayment.collectedAmount) : null,
    paymentMethod: task.order.deliveryPayment?.paymentMethod ?? null,
    collectionStatus: task.order.deliveryPayment?.collectionStatus ?? null,
  }));

  const statusSummary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === "assigned") acc.assigned += 1;
      if (row.status === "accepted" || row.status === "arrived") acc.inProgress += 1;
      if (row.status === "completed") acc.completed += 1;
      if (row.status === "failed") acc.failed += 1;
      return acc;
    },
    { total: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0 }
  );

  const locationMap = new Map<string, RiderLocationSummary>();
  for (const row of rows.filter((item) => item.status === "completed")) {
    const key = row.locationName ?? "Unassigned location";
    const current = locationMap.get(key) ?? {
      locationName: key,
      orderCount: 0,
      cashTotal: "0.00",
      bankTransferTotal: "0.00",
      cardTotal: "0.00",
      alreadyPaidTotal: "0.00",
      collectedTotal: "0.00",
    };

    const collected = Number.parseFloat(row.collectedAmount ?? row.expectedAmount ?? "0");
    current.orderCount += 1;
    current.collectedTotal = (Number.parseFloat(current.collectedTotal) + collected).toFixed(2);
    if (row.paymentMethod === "cod") {
      current.cashTotal = (Number.parseFloat(current.cashTotal) + collected).toFixed(2);
    } else if (row.paymentMethod === "bank_transfer") {
      current.bankTransferTotal = (
        Number.parseFloat(current.bankTransferTotal) + collected
      ).toFixed(2);
    } else if (row.paymentMethod === "card") {
      current.cardTotal = (Number.parseFloat(current.cardTotal) + collected).toFixed(2);
    } else if (row.paymentMethod === "already_paid") {
      current.alreadyPaidTotal = (
        Number.parseFloat(current.alreadyPaidTotal) + collected
      ).toFixed(2);
    }
    locationMap.set(key, current);
  }

  return {
    rider: {
      id: rider.id,
      name: rider.name,
      knownName: rider.knownName,
      email: rider.email,
      mobile: rider.mobile,
      status: rider.employeeProfile?.status ?? null,
      locationName: rider.employeeProfile?.location?.name ?? null,
    },
    rows,
    statusSummary,
    locationSummary: [...locationMap.values()].sort((a, b) =>
      a.locationName.localeCompare(b.locationName)
    ),
  };
}
