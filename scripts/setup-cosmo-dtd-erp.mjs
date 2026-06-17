/**
 * One-time setup: Cosmetics ERP instance + DTD company on Cosmo OS locations.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/setup-cosmo-dtd-erp.mjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/setup-cosmo-dtd-erp.mjs --apply
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const apply = process.argv.includes("--apply");

const ERP_COMPANY = "DTD (PVT) LTD";
const ERP_WAREHOUSE = "Main Warehouse - DTD";

function loadCosmoErpEnv() {
  const mcpPath = resolve(root, ".mcp.json");
  const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
  const env = mcp.mcpServers?.["erpnext-cosmo"]?.env;
  if (!env?.ERPNEXT_URL || !env?.ERPNEXT_API_KEY || !env?.ERPNEXT_API_SECRET) {
    throw new Error("Missing erpnext-cosmo credentials in .mcp.json");
  }
  return {
    baseUrl: env.ERPNEXT_URL.replace(/\/$/, ""),
    apiKey: env.ERPNEXT_API_KEY,
    apiSecret: env.ERPNEXT_API_SECRET,
  };
}

const erp = loadCosmoErpEnv();
const prisma = new PrismaClient();

const instanceData = {
  label: "Cosmetics ERP (DTD)",
  baseUrl: erp.baseUrl,
  apiKey: erp.apiKey,
  apiSecret: erp.apiSecret,
  incomingWebhookSecret: randomBytes(32).toString("hex"),
  cashMop: "Cash",
  codMop: "Cash",
  cardDeliveryMop: "Credit Card",
  bankTransferMop: "Wire Transfer",
  kokoMop: "Koko",
  webxpayMop: "",
  taxesAndCharges: "Sri Lanka Tax - DTD",
  shippingRule: "",
  shippingItem: "",
  shippingChargeAccount: "",
};

try {
  const [instances, locations] = await Promise.all([
    prisma.erpnextInstance.findMany({
      select: { id: true, label: true, baseUrl: true, _count: { select: { locations: true } } },
    }),
    prisma.companyLocation.findMany({
      select: { id: true, name: true, erpnextCompany: true, erpnextWarehouse: true, erpnextInstanceId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", existingInstances: instances, locations }, null, 2));

  if (instances.length > 0) {
    console.log("\nERP instance(s) already exist — skipping create. Update locations manually if needed.");
    process.exit(0);
  }

  if (!apply) {
    console.log("\n[dry-run] Would create ERP instance and link all locations to:");
    console.log(`  company: ${ERP_COMPANY}`);
    console.log(`  warehouse: ${ERP_WAREHOUSE}`);
    console.log("Run with --apply to write to database.");
    process.exit(0);
  }

  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("No Company row found");

  const instance = await prisma.erpnextInstance.create({
    data: { companyId: company.id, ...instanceData },
    select: { id: true, label: true, incomingWebhookSecret: true },
  });

  const updated = await prisma.companyLocation.updateMany({
    where: { companyId: company.id },
    data: {
      erpnextInstanceId: instance.id,
      erpnextCompany: ERP_COMPANY,
      erpnextWarehouse: ERP_WAREHOUSE,
    },
  });

  console.log("\n[apply] Created ERP instance:", instance.id, instance.label);
  console.log("[apply] Linked locations:", updated.count);
  console.log("[apply] Webhook secret (save for ERPNext webhooks):", instance.incomingWebhookSecret);
  console.log("\nNext steps:");
  console.log("  1. Settings → ERP Instances — verify MOP / tax settings");
  console.log("  2. Create 'Cash On Delivery' Mode of Payment in ERP if needed (codMop is Cash for now)");
  console.log("  3. Configure ERPNext webhooks → https://os.cosmetics.lk/api/webhooks/erpnext/...");
  console.log("  4. Do NOT click Enable sync until you are ready for live order → SI sync");
} finally {
  await prisma.$disconnect();
}
