import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

type FulfillmentLookupsPayload = {
  samplesFreeIssues: Array<{ id: string; name: string; type: "sample" | "free_issue" }>;
  packageHoldReasons: Array<{ id: string; name: string }>;
  courierServices: Array<{ id: string; name: string }>;
  riders: Array<{ id: string; name: string | null; mobile: string | null }>;
};

const LOOKUPS_TTL_MS = 30_000;
const lookupsCache = new Map<
  string,
  { expiresAt: number; payload: FulfillmentLookupsPayload }
>();

export async function GET() {
  const auth = await requireAnyPermission([
    "orders.read",
    "fulfillment.sample_free_issue.read",
    "fulfillment.order_print.read",
    "fulfillment.ready_dispatch.read",
    "fulfillment.delivery_invoice.read",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const cached = lookupsCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const [samplesFreeIssues, packageHoldReasons, courierServices, riders] =
    await Promise.all([
      prisma.sampleFreeIssueItem.findMany({
        where: { companyId },
        orderBy: [{ type: "asc" }, { name: "asc" }],
        select: { id: true, name: true, type: true },
      }),
      prisma.packageHoldReason.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.courierService.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: {
          companyId,
          employeeProfile: { isRider: true, status: "active" },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, mobile: true },
      }),
    ]);

  const payload: FulfillmentLookupsPayload = {
    samplesFreeIssues,
    packageHoldReasons,
    courierServices,
    riders,
  };
  lookupsCache.set(companyId, {
    expiresAt: Date.now() + LOOKUPS_TTL_MS,
    payload,
  });

  return NextResponse.json(payload);
}
