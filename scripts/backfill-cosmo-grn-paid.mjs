/**
 * Reconcile Cosmo GRN Paid from settled linked Purchase Invoices.
 * Run via: node scripts/with-env.mjs cosmo-prod node scripts/backfill-cosmo-grn-paid.mjs
 * Add --apply to write. Dry run is the default.
 */
import { PrismaClient } from "@prisma/client";

if ((process.env.NEXT_PUBLIC_APP_NAME ?? "").toLowerCase().includes("vault")) {
  throw new Error("This backfill is Cosmo-only");
}

const apply = process.argv.includes("--apply");
const only = new Set(process.argv.filter((arg) => arg.startsWith("--only=")).flatMap((arg) => arg.slice(7).split(",").map((name) => name.trim()).filter(Boolean)));
const prisma = new PrismaClient();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function invoiceBalance(name, instance) {
  const fields = encodeURIComponent(JSON.stringify(["docstatus", "outstanding_amount"]));
  const url = `${instance.baseUrl.replace(/\/$/, "")}/api/resource/Purchase%20Invoice/${encodeURIComponent(name)}?fields=${fields}`;
  const response = await fetch(url, {
    headers: { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ERP Purchase Invoice ${name}: HTTP ${response.status}`);
  const { data } = await response.json();
  if (data?.docstatus !== 1 || !Number.isFinite(Number(data.outstanding_amount))) {
    throw new Error(`ERP Purchase Invoice ${name}: missing active balance`);
  }
  return Number(data.outstanding_amount);
}

async function main() {
  const [live, backfill, invoices, backfillInvoices, approvals] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: { receivedAt: { not: null }, deletedAt: null, docstatus: { not: 2 } },
      select: { companyId: true, name: true, companyLocation: { select: { erpnextCompany: true, erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } } } } },
    }),
    prisma.grnBackfillPurchaseReceipt.findMany({
      where: { receivedAt: { not: null }, deletedAt: null, docstatus: { not: 2 } },
      select: { companyId: true, name: true, companyLocation: { select: { erpnextCompany: true, erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } } } } },
    }),
    prisma.grnPurchaseInvoice.findMany({
      where: { deletedAt: null, docstatus: 1, isReturn: { not: 1 }, purchaseReceiptName: { not: null } },
      select: { companyId: true, purchaseReceiptName: true, name: true },
    }),
    prisma.grnBackfillPurchaseInvoice.findMany({
      where: { deletedAt: null, docstatus: 1, isReturn: { not: 1 }, purchaseReceiptName: { not: null } },
      select: { companyId: true, purchaseReceiptName: true, name: true },
    }),
    prisma.grnPaymentApproval.findMany({ select: { companyId: true, purchaseReceiptName: true, purchaseReceiptIsBackfill: true, paidAt: true } }),
  ]);
  const invoiceByReceipt = new Map();
  for (const invoice of [...invoices, ...backfillInvoices]) {
    const key = `${invoice.companyId}:${invoice.purchaseReceiptName}`;
    const names = invoiceByReceipt.get(key) ?? new Set();
    names.add(invoice.name);
    invoiceByReceipt.set(key, names);
  }
  const paidKeys = new Set(approvals.filter((row) => row.paidAt).map((row) => `${row.companyId}:${row.purchaseReceiptName}:${row.purchaseReceiptIsBackfill}`));
  const candidates = [...live.map((row) => ({ ...row, isBackfill: false })), ...backfill.map((row) => ({ ...row, isBackfill: true }))]
    .filter((row) => !paidKeys.has(`${row.companyId}:${row.name}:${row.isBackfill}`) && (!only.size || only.has(row.name)));
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${candidates.length} received GRNs missing Paid`);
  const totals = { settled: 0, pending: 0, noInvoice: 0, noConnection: 0, errors: 0, updated: 0 };
  for (const [index, row] of candidates.entries()) {
    const names = [...(invoiceByReceipt.get(`${row.companyId}:${row.name}`) ?? [])];
    if (!names.length) { totals.noInvoice++; continue; }
    const instance = row.companyLocation?.erpnextInstance;
    if (!instance?.baseUrl || !instance.apiKey || !instance.apiSecret || !row.companyLocation?.erpnextCompany) {
      totals.noConnection++; continue;
    }
    try {
      const balances = [];
      for (const name of names) {
        balances.push(await invoiceBalance(name, instance));
        await delay(100);
      }
      if (balances.some((balance) => Math.abs(balance) > 0.005)) { totals.pending++; continue; }
      totals.settled++;
      console.log(`${row.isBackfill ? "backfill" : "live"} ${row.name}: ${names.join(", ")} settled`);
      if (apply) {
        await prisma.grnPaymentApproval.upsert({
          where: { companyId_purchaseReceiptName_purchaseReceiptIsBackfill: {
            companyId: row.companyId, purchaseReceiptName: row.name, purchaseReceiptIsBackfill: row.isBackfill,
          } },
          create: { companyId: row.companyId, purchaseReceiptName: row.name, purchaseReceiptIsBackfill: row.isBackfill, approvedAt: null, paidAt: new Date() },
          update: { paidAt: new Date() },
        });
        totals.updated++;
      }
    } catch (error) {
      totals.errors++;
      console.error(`${row.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if ((index + 1) % 25 === 0) console.log(`Scanned ${index + 1}/${candidates.length}`);
  }
  console.log(JSON.stringify(totals));
}

try { await main(); } finally { await prisma.$disconnect(); }
