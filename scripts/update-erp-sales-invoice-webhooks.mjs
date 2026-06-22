#!/usr/bin/env node
/**
 * Update Sales Invoice webhooks (HOOK-0001/2/3) on Cosmetics + Vault ERP sites.
 * Usage: node scripts/update-erp-sales-invoice-webhooks.mjs [--dry-run]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSalesInvoiceWebhookJson } from "./erp-webhook-sales-invoice-json.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

function loadMcpConfig() {
  const raw = readFileSync(join(__dirname, "..", ".mcp.json"), "utf8");
  return JSON.parse(raw).mcpServers;
}

const sites = [
  {
    label: "cosmetics-lk-02",
    url: loadMcpConfig()["erpnext-cosmo"].env.ERPNEXT_URL,
    key: loadMcpConfig()["erpnext-cosmo"].env.ERPNEXT_API_KEY,
    secret: loadMcpConfig()["erpnext-cosmo"].env.ERPNEXT_API_SECRET,
    vaultStyle: false,
  },
  {
    label: "vault-lk-01",
    url: loadMcpConfig().erpnext.env.ERPNEXT_URL,
    key: loadMcpConfig().erpnext.env.ERPNEXT_API_KEY,
    secret: loadMcpConfig().erpnext.env.ERPNEXT_API_SECRET,
    vaultStyle: true,
  },
];

const HOOKS = ["HOOK-0001", "HOOK-0002", "HOOK-0003"];

async function updateHook(creds, name, webhookJson) {
  const base = creds.url.replace(/\/$/, "");
  const res = await fetch(`${base}/api/resource/Webhook/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${creds.key}:${creds.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ webhook_json: webhookJson }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${name} update failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return res.json();
}

async function main() {
  for (const site of sites) {
    const webhookJson = buildSalesInvoiceWebhookJson({ vaultStyle: site.vaultStyle });
    console.log(`\n=== ${site.label} ===`);
    for (const hook of HOOKS) {
      if (dryRun) {
        console.log(`[dry-run] Would update ${hook}`);
        continue;
      }
      await updateHook(site, hook, webhookJson);
      console.log(`Updated ${hook}`);
    }
  }
  console.log(dryRun ? "\nDry run complete." : "\nAll webhooks updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
