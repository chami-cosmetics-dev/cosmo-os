/**
 * Resend rider_dispatched SMS for today's rider-dispatched orders that never got one.
 *
 * Refuses to run while the Hutch 401 circuit breaker is latched (lib/hutch-sms.ts),
 * because every send would be swallowed as "SMS paused after Hutch login 401" —
 * which is exactly how 55 rider SMS were lost on 2026-09-09.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod npx tsx --tsconfig tsconfig.scripts.json scripts/resend-todays-rider-sms.ts
 *   node scripts/with-env.mjs cosmo-prod npx tsx --tsconfig tsconfig.scripts.json scripts/resend-todays-rider-sms.ts --send
 *   ... --send --date=2026-09-09   # a specific Asia/Colombo day
 *
 * The --tsconfig flag is required: it maps Next's `server-only` guard to a no-op
 * shim so lib/prisma.ts is importable from the CLI.
 */

import { PrismaClient } from "@prisma/client";

import { sendOrderSms } from "../lib/order-sms";
import {
  getDeliveryUrl,
  resolveOrderInvoiceNumber,
  resolveOrderNumber,
} from "../lib/order-sms-resolvers";

const args = process.argv.slice(2);
const SEND = args.includes("--send");
const dateArg = args.find((a) => a.startsWith("--date="))?.split("=")[1] ?? null;

const prisma = new PrismaClient();

const OFFSET_MIN = 330; // Asia/Colombo, UTC+5:30
const fmt = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() + OFFSET_MIN * 60000).toISOString().replace("T", " ").slice(0, 19) : "-";
const norm = (p: string | null | undefined) => {
  const digits = String(p ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
};

function dayWindow(iso: string | null) {
  const base = iso ? new Date(`${iso}T00:00:00Z`) : new Date(Date.now() + OFFSET_MIN * 60000);
  const startUtc = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) - OFFSET_MIN * 60000,
  );
  return { startUtc, endUtc: new Date(startUtc.getTime() + 86400000) };
}

async function main() {
  const { startUtc, endUtc } = dayWindow(dateArg);
  console.log(`Window (UTC): ${startUtc.toISOString()} .. ${endUtc.toISOString()}`);

  const orders = await prisma.order.findMany({
    where: { dispatchedAt: { gte: startUtc, lt: endUtc }, dispatchedByRiderId: { not: null } },
    orderBy: { dispatchedAt: "asc" },
    select: {
      id: true,
      companyId: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      erpnextInvoiceId: true,
      dispatchedAt: true,
      riderDeliveryToken: true,
      fulfillmentStage: true,
      deliveryOutcome: true,
      dispatchedByRider: { select: { name: true, mobile: true } },
    },
  });

  const sentLogs = await prisma.smsLog.findMany({
    where: { sentAt: { gte: startUtc, lt: endUtc }, status: "sent" },
    select: { companyId: true, phoneNumber: true, message: true },
  });

  // Bail out early if the provider gate is still latched for any affected company.
  for (const companyId of [...new Set(orders.map((o) => o.companyId))]) {
    const portal = await prisma.smsPortalConfig.findUnique({ where: { companyId } });
    if (!portal) {
      console.error(`ABORT: company ${companyId} has no SmsPortalConfig.`);
      process.exit(1);
    }
    const gate = await prisma.smsLog.findFirst({
      where: {
        companyId,
        status: "failed",
        sentAt: { gte: portal.updatedAt },
        message: { contains: "Hutch login rejected (401" },
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    if (gate) {
      console.error(
        `ABORT: Hutch 401 breaker is LATCHED for ${portal.username} ` +
          `(401 at ${fmt(gate.sentAt)}, portal updatedAt ${fmt(portal.updatedAt)}).\n` +
          `       Re-save the SMS Portal password in Settings and run Test SMS first — ` +
          `otherwise every send here is silently swallowed.`,
      );
      process.exit(1);
    }
    console.log(`Gate clear for ${portal.username} (portal updatedAt ${fmt(portal.updatedAt)})`);
  }

  type Candidate = (typeof orders)[number];
  const candidates: { order: Candidate; num: string; phone: string }[] = [];
  const skipped: { num: string; why: string[] }[] = [];

  for (const order of orders) {
    const num = resolveOrderNumber(order) || order.id;
    const invoiceNumber = resolveOrderInvoiceNumber(order);
    const phone = order.dispatchedByRider?.mobile?.trim();

    const why: string[] = [];
    if (!phone) why.push("rider has no mobile");
    if (!order.riderDeliveryToken) why.push("no delivery token");
    if (!invoiceNumber) why.push("no ERP invoice");
    if (order.fulfillmentStage !== "dispatched") why.push(`stage=${order.fulfillmentStage}`);
    if (order.deliveryOutcome && order.deliveryOutcome !== "pending") {
      why.push(`outcome=${order.deliveryOutcome}`);
    }

    // Don't double-send: a successful log today to this rider naming this order.
    const already = sentLogs.some(
      (l) =>
        l.companyId === order.companyId &&
        phone &&
        norm(l.phoneNumber) === norm(phone) &&
        l.message.includes(num),
    );
    if (already) why.push("rider SMS already sent today");

    if (why.length || !phone) skipped.push({ num, why });
    else candidates.push({ order, num, phone });
  }

  console.log(
    `\n${SEND ? "SENDING" : "DRY RUN"} — ${candidates.length} to send, ${skipped.length} skipped\n`,
  );
  for (const s of skipped) console.log(`  SKIP ${s.num.padEnd(12)} ${s.why.join("; ")}`);
  if (skipped.length) console.log("");

  if (!SEND) {
    const perRider = new Map<string, number>();
    for (const c of candidates) {
      const key = `${c.order.dispatchedByRider?.name ?? "?"} (${c.phone})`;
      perRider.set(key, (perRider.get(key) ?? 0) + 1);
    }
    for (const [key, count] of [...perRider].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(3)} -> ${key}`);
    }
    console.log("\nRe-run with --send to actually send.");
    return;
  }

  let ok = 0;
  let threw = 0;
  for (const c of candidates) {
    const orderNum = resolveOrderNumber(c.order);
    const invoiceNumber = resolveOrderInvoiceNumber(c.order);
    try {
      await sendOrderSms(c.order.companyId, c.order.id, "rider_dispatched", {
        orderNumber: orderNum,
        invoiceNumber,
        orderReference: [orderNum, invoiceNumber].filter(Boolean).join(" / "),
        riderName: c.order.dispatchedByRider?.name ?? undefined,
        riderPhone: c.phone,
        deliveryUrl: getDeliveryUrl(c.order),
      });
      ok++;
      console.log(`  sent ${c.num.padEnd(12)} -> ${c.phone}`);
    } catch (err) {
      threw++;
      console.error(`  FAIL ${c.num.padEnd(12)} -> ${c.phone}: ${(err as Error)?.message ?? err}`);
    }
  }
  console.log(`\nDone: ${ok} handed to provider, ${threw} threw.`);
  console.log("sendOrderSms swallows provider failures into SmsLog — verify there before declaring success.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
