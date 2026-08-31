/**
 * One-off rider SMS diagnostic. Do not commit.
 * Usage: node scripts/with-env.mjs cosmo-prod node scripts/_sms-diag.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function maskPhone(p) {
  const d = String(p ?? "").replace(/\D/g, "");
  if (d.length < 4) return `(len ${d.length})`;
  return `${d.slice(0, 4)}…${d.slice(-2)} (${d.length} digits)`;
}

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });
  console.log("=== companies ===");
  for (const c of companies) console.log(`  ${c.name} ${c.id}`);

  const portals = await prisma.smsPortalConfig.findMany({
    select: {
      companyId: true,
      username: true,
      authUrl: true,
      smsUrl: true,
      smsMask: true,
      campaignName: true,
      updatedAt: true,
    },
  });
  console.log("\n=== sms portal ===");
  for (const p of portals) {
    const company = companies.find((c) => c.id === p.companyId);
    console.log(
      JSON.stringify({
        company: company?.name,
        username: p.username,
        mask: p.smsMask,
        campaign: p.campaignName,
        authUrl: p.authUrl,
        smsUrl: p.smsUrl,
        updatedAt: p.updatedAt,
      }),
    );
  }

  const configs = await prisma.smsNotificationConfig.findMany({
    orderBy: [{ companyId: "asc" }, { trigger: "asc" }],
  });
  console.log("\n=== sms notification configs ===");
  for (const cfg of configs) {
    const company = companies.find((c) => c.id === cfg.companyId);
    const extra = Array.isArray(cfg.additionalRecipients)
      ? cfg.additionalRecipients
      : [];
    console.log(
      JSON.stringify({
        company: company?.name,
        trigger: cfg.trigger,
        enabled: cfg.enabled,
        sendToCustomer: cfg.sendToCustomer,
        sendToRider: cfg.sendToRider,
        extraCount: extra.length,
        template: cfg.template,
        updatedAt: cfg.updatedAt,
      }),
    );
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const logs = await prisma.smsLog.findMany({
    where: { sentAt: { gte: since } },
    orderBy: { sentAt: "desc" },
    take: 80,
    select: {
      phoneNumber: true,
      message: true,
      status: true,
      sentAt: true,
      companyId: true,
    },
  });
  console.log(`\n=== sms logs last 48h (${logs.length}) ===`);
  const statusCounts = {};
  let riderish = 0;
  let failed = 0;
  for (const log of logs) {
    statusCounts[log.status] = (statusCounts[log.status] ?? 0) + 1;
    const isRider =
      /assigned for delivery|Confirm when delivered|\/r\/d\//i.test(log.message);
    if (isRider) riderish += 1;
    if (log.status === "failed" || log.message.startsWith("[FAILED]")) failed += 1;
    if (isRider || log.status === "failed" || log.message.startsWith("[FAILED]")) {
      console.log(
        JSON.stringify({
          at: log.sentAt,
          status: log.status,
          phone: maskPhone(log.phoneNumber),
          preview: log.message.slice(0, 180),
        }),
      );
    }
  }
  console.log("statusCounts", statusCounts, "riderish", riderish, "failedish", failed);

  const riders = await prisma.user.findMany({
    where: { employeeProfile: { isRider: true } },
    select: {
      id: true,
      name: true,
      mobile: true,
      companyId: true,
      employeeProfile: { select: { isRider: true, status: true } },
    },
  });
  console.log(`\n=== riders (${riders.length}) ===`);
  for (const r of riders) {
    const company = companies.find((c) => c.id === r.companyId);
    console.log(
      JSON.stringify({
        name: r.name,
        company: company?.name,
        status: r.employeeProfile?.status,
        mobile: r.mobile ? maskPhone(r.mobile) : "MISSING",
        rawLen: r.mobile?.length ?? 0,
        rawSample: r.mobile
          ? JSON.stringify(r.mobile).slice(0, 40)
          : null,
      }),
    );
  }

  const recentDispatch = await prisma.order.findMany({
    where: {
      dispatchedAt: { gte: since },
      dispatchedByRiderId: { not: null },
    },
    orderBy: { dispatchedAt: "desc" },
    take: 25,
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      dispatchedAt: true,
      riderDeliveryToken: true,
      dispatchedByRider: { select: { name: true, mobile: true } },
    },
  });
  console.log(`\n=== recent rider dispatches last 48h (up to 25) ===`);
  for (const o of recentDispatch) {
    console.log(
      JSON.stringify({
        order: o.name || o.orderNumber,
        at: o.dispatchedAt,
        erp: o.erpnextInvoiceId,
        token: Boolean(o.riderDeliveryToken),
        rider: o.dispatchedByRider?.name,
        riderMobile: o.dispatchedByRider?.mobile
          ? maskPhone(o.dispatchedByRider.mobile)
          : "MISSING",
      }),
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
