import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import { formatAddress } from "@/lib/reports/csv";
import {
  extractOrderShippingCity,
  isUsableShippingCityForCharge,
  riderIncentiveMatchDisplayLabel,
  resolveOrderShippingRuleLabel,
  suggestRiderDistrictsFromAddress,
  type RiderDistrictChargeOption,
} from "@/lib/rider-delivery-charge";
import { resolveOrderShippingDisplay } from "@/lib/order-shipping-display";
import { incentiveMatchForOrder, loadRiderIncentiveContext } from "@/lib/rider-incentive-resolve";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { aggregateRiderIncentives, isIncentiveEligibleOrder } from "@/lib/rider-incentive";
import { cuidSchema } from "@/lib/validation";

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  from: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
  to: ymdSchema.or(z.string().datetime({ offset: true })).or(z.string().min(10).max(40)),
  riderId: cuidSchema.optional(),
});

function resolveRangeBound(raw: string, kind: "start" | "end"): Date | null {
  const asYmd = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : formatAppIsoDate(raw, "");
  if (!asYmd) return null;
  return kind === "start" ? parseAppCalendarDayStart(asYmd) : parseAppCalendarDayEnd(asYmd);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("riders.performance.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
    riderId: request.nextUrl.searchParams.get("riderId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const from = resolveRangeBound(parsed.data.from, "start");
  const to = resolveRangeBound(parsed.data.to, "end");
  if (!from || !to || to < from) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const [tasks, incentiveContext, chargeRules] = await Promise.all([
    prisma.riderDeliveryTask.findMany({
      where: {
        status: "completed",
        completedAt: { gte: from, lte: to },
        ...(parsed.data.riderId ? { riderId: parsed.data.riderId } : {}),
        order: { companyId },
      },
      select: {
        id: true,
        riderId: true,
        completedAt: true,
        manualIncentiveLabelKey: true,
        manualIncentiveLabel: true,
        rider: { select: { name: true, knownName: true } },
        order: {
          select: {
            id: true,
            totalShipping: true,
            shippingLines: true,
            shippingAddress: true,
            rawPayload: true,
            sourceName: true,
            discountCodes: true,
            financialStatus: true,
            orderNumber: true,
            name: true,
            customerPhone: true,
            district: true,
          },
        },
      },
    }),
    loadRiderIncentiveContext(),
    prisma.riderDeliveryChargeRule.findMany({
      orderBy: { label: "asc" },
      select: { labelKey: true, label: true, riderDeliveryCharge: true },
    }),
  ]);

  const districtOptions: RiderDistrictChargeOption[] = chargeRules.map((rule) => ({
    labelKey: rule.labelKey,
    label: rule.label,
    riderDeliveryCharge: rule.riderDeliveryCharge.toFixed(2),
  }));

  type UnmatchedRow = {
    taskId: string;
    orderId: string;
    orderNumber: string;
    deliveryType: string;
    city: string | null;
    cityUsable: boolean;
    deliveryPrice: string | null;
    addressText: string;
    phone: string | null;
    source: string | null;
    suggestions: RiderDistrictChargeOption[];
  };

  const unmatchedByRiderMap = new Map<
    string,
    {
      riderId: string;
      riderName: string;
      orders: UnmatchedRow[];
    }
  >();

  const rowInputs = tasks.map((task) => {
    const shippingLabel = resolveOrderShippingRuleLabel(task.order);
    const deliveryType = riderIncentiveMatchDisplayLabel(shippingLabel);
    const match = incentiveMatchForOrder(
      task.order,
      incentiveContext.chargeByLabelKey,
      incentiveContext.zoneMembersByZone,
      task.manualIncentiveLabelKey
    );

    if (
      isIncentiveEligibleOrder(task.order.financialStatus) &&
      !match.matched &&
      !match.excludedFromIncentive &&
      !task.manualIncentiveLabelKey
    ) {
      const city = extractOrderShippingCity(task.order);
      const cityUsable = isUsableShippingCityForCharge(city);
      const shippingDisplay = resolveOrderShippingDisplay({
        ...task.order,
        totalShipping:
          task.order.totalShipping == null ? null : task.order.totalShipping.toString(),
      });
      const deliveryPrice = shippingDisplay.amount;
      const addressText = formatAddress(task.order.shippingAddress) || "—";
      const orderNumber =
        task.order.orderNumber?.trim() || task.order.name?.trim() || "—";
      const riderName = task.rider.knownName || task.rider.name || "—";
      const group =
        unmatchedByRiderMap.get(task.riderId) ??
        {
          riderId: task.riderId,
          riderName,
          orders: [],
        };
      group.orders.push({
        taskId: task.id,
        orderId: task.order.id,
        orderNumber,
        deliveryType,
        city,
        cityUsable,
        deliveryPrice,
        addressText,
        phone: task.order.customerPhone,
        source: task.order.sourceName,
        suggestions: suggestRiderDistrictsFromAddress({
          addressText,
          city: cityUsable ? city : null,
          options: districtOptions,
          limit: 5,
        }),
      });
      unmatchedByRiderMap.set(task.riderId, group);
    }

    return {
      riderId: task.riderId,
      riderName: task.rider.name,
      knownName: task.rider.knownName,
      incentiveAmount: match.amount,
      matched: match.matched,
      excludedFromIncentive: match.excludedFromIncentive,
      financialStatus: task.order.financialStatus,
      completedAt: task.completedAt,
    };
  });

  const riders = aggregateRiderIncentives(rowInputs);

  let totalIncentive = new Prisma.Decimal(0);
  let unmatchedTotal = 0;
  let excludedFromIncentiveTotal = 0;
  for (const row of rowInputs) {
    if (!isIncentiveEligibleOrder(row.financialStatus)) continue;
    totalIncentive = totalIncentive.add(row.incentiveAmount);
    if (row.excludedFromIncentive) {
      excludedFromIncentiveTotal += 1;
    } else if (!row.matched) {
      unmatchedTotal += 1;
    }
  }

  const unmatchedByRider = Array.from(unmatchedByRiderMap.values())
    .map((group) => ({
      ...group,
      orders: group.orders.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber)),
    }))
    .sort((a, b) => a.riderName.localeCompare(b.riderName));

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    summary: {
      totalCompletions: riders.reduce((sum, r) => sum + r.completedCount, 0),
      totalIncentive: totalIncentive.toFixed(2),
      ridersWithCompletions: riders.length,
      unmatchedTotal,
      excludedFromIncentiveTotal,
    },
    districtOptions,
    unmatchedByRider,
    riders,
  });
}
