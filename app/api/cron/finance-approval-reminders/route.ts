import { NextRequest, NextResponse } from "next/server";

import { getFinanceApprovalUsers } from "@/lib/approval-workflow";
import { sendFinanceApprovalReminderEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REMINDER_AFTER_HOURS = 2;
const APPROVAL_TYPES = ["order_payment_approval", "payment_method_change_approval"];

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - REMINDER_AFTER_HOURS * 60 * 60 * 1000);

  // Fetch all pending pre-dispatch approvals older than the cutoff, with order location
  const pending = await prisma.approvalRequest.findMany({
    where: {
      status: "pending",
      type: { in: APPROVAL_TYPES },
      createdAt: { lt: cutoff },
      order: { isNot: null },
    },
    select: {
      id: true,
      companyId: true,
      requestNote: true,
      createdAt: true,
      order: {
        select: {
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
          totalPrice: true,
          currency: true,
          paymentGatewayPrimary: true,
          companyLocationId: true,
        },
      },
    },
  });

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  // Group by companyId + companyLocationId so we can look up the right finance users
  type PendingItem = (typeof pending)[number];
  const byLocation = new Map<string, PendingItem[]>();
  for (const item of pending) {
    const key = `${item.companyId}::${item.order?.companyLocationId ?? ""}`;
    const group = byLocation.get(key) ?? [];
    group.push(item);
    byLocation.set(key, group);
  }

  // For each location group, notify the responsible finance users
  let totalEmailed = 0;
  for (const [key, items] of byLocation) {
    const [companyId, locationId] = key.split("::");
    const financeUsers = await getFinanceApprovalUsers(companyId, locationId || null);

    const approvalRows = items.map((item) => {
      const order = item.order!;
      const waitingHours = Math.floor((Date.now() - item.createdAt.getTime()) / 3_600_000);
      const invoiceLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId ?? item.id;
      const paymentType = order.paymentGatewayPrimary ?? "payment";
      const amount = `${order.currency ?? "LKR"} ${Number(order.totalPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;
      return { invoiceLabel, paymentType, amount, waitingHours };
    });

    for (const user of financeUsers) {
      if (!user.email) continue;
      await sendFinanceApprovalReminderEmail(user.email, approvalRows).catch((err) =>
        console.error(`[finance-reminders] email failed for ${user.email}:`, err),
      );
      totalEmailed++;
    }
  }

  return NextResponse.json({ ok: true, reminded: totalEmailed, pendingCount: pending.length });
}
