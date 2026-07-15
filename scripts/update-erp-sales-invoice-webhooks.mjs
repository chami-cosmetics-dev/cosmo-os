#!/usr/bin/env node
/**
 * Update Sales Invoice webhooks on Cosmetics + Vault ERP sites.
 * Discovers Sales Invoice Webhook docs per site (hook names differ).
 * Usage: node scripts/update-erp-sales-invoice-webhooks.mjs [--dry-run]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSalesInvoiceWebhookJson } from "./erp-webhook-sales-invoice-json.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

function loadMcpEnvBlocks() {
  const raw = readFileSync(join(__dirname, "..", ".mcp.json"), "utf8");
  const matches = [
    ...raw.matchAll(
      /"ERPNEXT_URL":\s*"([^"]+)"\s*,\s*"ERPNEXT_API_KEY":\s*"([^"]+)"\s*,\s*"ERPNEXT_API_SECRET":\s*"([^"]+)"/g,
    ),
  ];
  return matches.map((m) => ({
    url: m[1],
    key: m[2],
    secret: m[3],
  }));
}

function sitesFromMcp() {
  const blocks = loadMcpEnvBlocks();
  const seen = new Set();
  const sites = [];
  for (const block of blocks) {
    const host = block.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (seen.has(host)) continue;
    seen.add(host);
    const vaultStyle = host.includes("supplement-vault");
    sites.push({
      label: host.split(".")[0] ?? host,
      ...block,
      vaultStyle,
    });
  }
  return sites;
}

async function listSalesInvoiceHooks(creds) {
  const base = creds.url.replace(/\/$/, "");
  const filters = encodeURIComponent(JSON.stringify([["webhook_doctype", "=", "Sales Invoice"]]));
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const res = await fetch(
    `${base}/api/resource/Webhook?filters=${filters}&fields=${fields}&limit_page_length=50`,
    { headers: { Authorization: `token ${creds.key}:${creds.secret}` } },
  );
  if (!res.ok) {
    throw new Error(`List webhooks failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.data ?? []).map((row) => row.name).filter(Boolean);
}

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
  const sites = sitesFromMcp();
  if (sites.length === 0) {
    throw new Error("No ERPNext credentials found in .mcp.json");
  }

  for (const site of sites) {
    const webhookJson = buildSalesInvoiceWebhookJson({ vaultStyle: site.vaultStyle });
    console.log(`\n=== ${site.label} ===`);
    const hooks = await listSalesInvoiceHooks(site);
    if (hooks.length === 0) {
      console.log("No Sales Invoice webhooks found");
      continue;
    }
    for (const hook of hooks) {
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
