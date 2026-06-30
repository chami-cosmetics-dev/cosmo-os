import { prisma } from "@/lib/prisma";
import { buildPickListAggregationForOrders } from "@/lib/pick-list-data";
import { getPickListTodayBounds } from "@/lib/pick-list-date";

export const PICK_LIST_GROUP_MAX_ORDERS = 100;

export function formatPickListGroupLabel(createdAt: Date, printedByName: string | null) {
  const when = createdAt.toLocaleString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const who = printedByName?.trim() || "Unknown user";
  return `${when} · ${who}`;
}

export async function createPickListGroup(
  companyId: string,
  printedById: string,
  orderIds: string[],
) {
  const uniqueOrderIds = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    PICK_LIST_GROUP_MAX_ORDERS,
  );
  if (uniqueOrderIds.length === 0) {
    throw new Error("No orders selected");
  }

  const validOrders = await prisma.order.findMany({
    where: {
      companyId,
      id: { in: uniqueOrderIds },
      financialStatus: { not: "voided" },
    },
    select: { id: true },
  });
  if (validOrders.length !== uniqueOrderIds.length) {
    throw new Error("One or more orders were not found");
  }

  const group = await prisma.pickListGroup.create({
    data: {
      companyId,
      printedById,
      orders: {
        create: uniqueOrderIds.map((orderId) => ({ orderId })),
      },
    },
    include: {
      printedBy: { select: { id: true, name: true, knownName: true, email: true } },
      orders: { select: { orderId: true } },
    },
  });

  const aggregation = await buildPickListAggregationForOrders(
    companyId,
    group.orders.map((row) => row.orderId),
  );

  const printedByName =
    group.printedBy.knownName?.trim() ||
    group.printedBy.name?.trim() ||
    group.printedBy.email?.trim() ||
    null;

  return {
    id: group.id,
    createdAt: group.createdAt.toISOString(),
    downloadedAt: null,
    label: formatPickListGroupLabel(group.createdAt, printedByName),
    printedByName,
    orderCount: aggregation.orderCount,
    totalLocations: aggregation.totalLocations,
    totalUnits: aggregation.totalUnits,
    locationGroups: aggregation.locationGroups,
  };
}

export async function listPickListGroups(companyId: string, downloaded: boolean, date?: string) {
  const { from, to } = getPickListTodayBounds(date);

  const groups = await prisma.pickListGroup.findMany({
    where: {
      companyId,
      downloadedAt: downloaded ? { not: null } : null,
      ...(!downloaded ? { createdAt: { gte: from, lte: to } } : {}),
    },
    include: {
      printedBy: { select: { name: true, knownName: true, email: true } },
      orders: { select: { orderId: true } },
    },
    orderBy: downloaded ? { downloadedAt: "desc" } : { createdAt: "desc" },
    take: downloaded ? 50 : 20,
  });

  const results = await Promise.all(
    groups.map(async (group) => {
      const orderIds = group.orders.map((row) => row.orderId);
      const aggregation = await buildPickListAggregationForOrders(companyId, orderIds);
      const printedByName =
        group.printedBy.knownName?.trim() ||
        group.printedBy.name?.trim() ||
        group.printedBy.email?.trim() ||
        null;
      return {
        id: group.id,
        createdAt: group.createdAt.toISOString(),
        downloadedAt: group.downloadedAt?.toISOString() ?? null,
        label: formatPickListGroupLabel(group.createdAt, printedByName),
        printedByName,
        orderCount: aggregation.orderCount,
        totalLocations: aggregation.totalLocations,
        totalUnits: aggregation.totalUnits,
        locationGroups: aggregation.locationGroups,
      };
    }),
  );

  return results;
}

export async function markPickListGroupDownloaded(companyId: string, groupId: string) {
  const group = await prisma.pickListGroup.findFirst({
    where: { id: groupId, companyId, downloadedAt: null },
    select: { id: true },
  });
  if (!group) return null;

  return prisma.pickListGroup.update({
    where: { id: group.id },
    data: { downloadedAt: new Date() },
    select: { id: true, downloadedAt: true },
  });
}

export async function getPickListGroupOrderIds(companyId: string, groupId: string) {
  const group = await prisma.pickListGroup.findFirst({
    where: { id: groupId, companyId },
    select: {
      downloadedAt: true,
      orders: { select: { orderId: true } },
    },
  });
  if (!group) return null;
  return {
    downloadedAt: group.downloadedAt,
    orderIds: group.orders.map((row) => row.orderId),
  };
}
