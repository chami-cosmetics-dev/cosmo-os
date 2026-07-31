/**
 * Enrich Contact Master from ERP1/ERP2 Customers linked to Cosmo ERP Orders,
 * and fill blank Order.customerPhone / customerEmail from ERP Customer + Contact.
 *
 * Standalone script (no Next.js / server-only imports).
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-customer-contacts.mjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-customer-contacts.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-customer-contacts.mjs --slot=erp1
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-customer-contacts.mjs --limit=500
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const envFile =
  process.argv.find((a) => a.endsWith(".env") || a.startsWith(".env.")) ?? ".env.cosmo-prod";
config({ path: envFile });

const args = process.argv.slice(2).filter((a) => !a.endsWith(".env") && !a.startsWith(".env."));
const dryRun = args.includes("--dry-run");
const companyIdArg = args.find((a) => a.startsWith("--company-id="))?.split("=")[1] ?? null;
const slotArg = args.find((a) => a.startsWith("--slot="))?.split("=")[1]?.toLowerCase() ?? null;
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const limit = limitArg ? Number(limitArg) : 5000;

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
});

function nullIfBlank(value) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.toLowerCase() === "none") return null;
  return trimmed;
}

function normalizeEmail(value) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed || null;
}

function normalizePhone(value) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function buildPhoneLookupVariants(raw) {
  const t = raw.trim();
  let d = raw.replace(/\D/g, "");
  const out = new Set();
  if (t) out.add(t);
  if (d.startsWith("00")) d = d.slice(2);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  return [...out].filter(Boolean);
}

function resolveSlots(instances) {
  const erp1Match = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2Match = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  if (erp1Match || erp2Match) {
    return [
      ...(erp1Match ? [{ ...erp1Match, slot: "erp1" }] : []),
      ...(erp2Match ? [{ ...erp2Match, slot: "erp2" }] : []),
    ];
  }
  return instances.slice(0, 2).map((inst, idx) => ({
    ...inst,
    slot: idx === 0 ? "erp1" : "erp2",
  }));
}

async function loadInstances(companyId) {
  const rows = await prisma.erpnextInstance.findMany({
    where: { companyId },
    select: {
      id: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      apiSecret: true,
    },
    orderBy: { createdAt: "asc" },
  });
  let slotted = resolveSlots(rows.filter((i) => i.baseUrl && i.apiKey && i.apiSecret));
  if (slotArg === "erp1" || slotArg === "erp2") {
    slotted = slotted.filter((i) => i.slot === slotArg);
  }
  return slotted.map((i) => ({
    ...i,
    cfg: {
      baseUrl: i.baseUrl.replace(/\/$/, ""),
      apiKey: i.apiKey,
      apiSecret: i.apiSecret,
    },
  }));
}

async function erpGetJson(cfg, path) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERP GET ${path} [${res.status}]: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function getCustomerWithContacts(cfg, customerId) {
  const id = customerId.trim();
  if (!id) return null;
  let customer;
  try {
    const json = await erpGetJson(cfg, `/api/resource/Customer/${encodeURIComponent(id)}`);
    customer = json.data ?? null;
  } catch {
    return null;
  }
  if (!customer) return null;

  const filters = encodeURIComponent(
    JSON.stringify([
      ["Dynamic Link", "link_doctype", "=", "Customer"],
      ["Dynamic Link", "link_name", "=", id],
    ]),
  );
  const fields = encodeURIComponent(
    JSON.stringify(["name", "mobile_no", "phone", "email_id"]),
  );
  let contacts = [];
  try {
    const json = await erpGetJson(
      cfg,
      `/api/resource/Contact?filters=${filters}&fields=${fields}&limit_page_length=50`,
    );
    contacts = json.data ?? [];
  } catch {
    contacts = [];
  }

  const phones = new Set();
  const emails = new Set();
  const customerMobile = nullIfBlank(customer.mobile_no);
  const customerEmail = nullIfBlank(customer.email_id);
  if (customerMobile) phones.add(customerMobile);
  if (customerEmail) emails.add(customerEmail.toLowerCase());
  for (const c of contacts) {
    const mobile = nullIfBlank(c.mobile_no);
    const phone = nullIfBlank(c.phone);
    const email = nullIfBlank(c.email_id);
    if (mobile) phones.add(mobile);
    if (phone) phones.add(phone);
    if (email) emails.add(email.toLowerCase());
  }

  return {
    customerId: customer.name ?? id,
    customerName: nullIfBlank(customer.customer_name) ?? nullIfBlank(customer.name),
    mobileNo: customerMobile ?? [...phones][0] ?? null,
    emailId: customerEmail ?? [...emails][0] ?? null,
    phones: [...phones],
    emails: [...emails],
  };
}

async function syncContactMaster({ companyId, source, email, phoneNumber, name }) {
  const emailN = normalizeEmail(email);
  const phoneN = normalizePhone(phoneNumber);
  if (!emailN && !phoneN) return { status: "skipped_no_identifier" };

  const phoneVariants = phoneN ? buildPhoneLookupVariants(phoneN) : [];
  const candidates = await prisma.contactMaster.findMany({
    where: {
      companyId,
      OR: [
        ...(emailN ? [{ email: { equals: emailN, mode: "insensitive" } }] : []),
        ...(phoneVariants.length ? [{ phoneNumber: { in: phoneVariants } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      source: true,
    },
  });

  const emailMatches = emailN
    ? candidates.filter((c) => c.email?.trim().toLowerCase() === emailN)
    : [];
  const phoneMatches = phoneVariants.length
    ? candidates.filter((c) => phoneVariants.includes(c.phoneNumber?.trim() ?? ""))
    : [];

  if (emailMatches.length > 1 || phoneMatches.length > 1) return { status: "conflict" };
  const emailMatch = emailMatches[0] ?? null;
  const phoneMatch = phoneMatches[0] ?? null;
  if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) return { status: "conflict" };

  const matched = emailMatch ?? phoneMatch;
  if (!matched) {
    if (dryRun) return { status: "created" };
    const created = await prisma.contactMaster.create({
      data: {
        companyId,
        name: name?.trim() || emailN || phoneN || "ERP Contact",
        email: emailN,
        phoneNumber: phoneN,
        ...(source ? { source } : {}),
      },
      select: { id: true },
    });
    return { status: "created", contactId: created.id };
  }

  const updateData = {};
  if ((!matched.name || !matched.name.trim()) && name?.trim()) updateData.name = name.trim();
  if (!matched.email && emailN) updateData.email = emailN;
  if (!matched.phoneNumber && phoneN) updateData.phoneNumber = phoneN;
  if (!matched.source && source) updateData.source = source;

  if (Object.keys(updateData).length === 0) {
    return { status: "unchanged", contactId: matched.id };
  }
  if (dryRun) return { status: "enriched", contactId: matched.id };
  await prisma.contactMaster.update({ where: { id: matched.id }, data: updateData });
  return { status: "enriched", contactId: matched.id };
}

async function resolveCompanyId() {
  if (companyIdArg) return companyIdArg;
  const withErp = await prisma.erpnextInstance.findFirst({
    orderBy: { createdAt: "asc" },
    select: { companyId: true },
  });
  if (!withErp) throw new Error("No ErpnextInstance found — pass --company-id=");
  return withErp.companyId;
}

async function loadCustomerIdsByInstance(companyId, instances) {
  const instanceIds = new Set(instances.map((i) => i.id));
  const byInstance = new Map();
  for (const instance of instances) byInstance.set(instance.id, new Set());

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      sourceName: { in: ["erpnext", "erpnext-pos"] },
      OR: [{ erpnextCustomerId: { not: null } }, { erpnextInvoiceId: { not: null } }],
    },
    select: {
      erpnextCustomerId: true,
      rawPayload: true,
      companyLocation: { select: { erpnextInstanceId: true } },
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  for (const order of orders) {
    const instanceId = order.companyLocation?.erpnextInstanceId;
    if (!instanceId || !instanceIds.has(instanceId)) continue;
    const bucket = byInstance.get(instanceId);
    if (!bucket) continue;

    const fromCol = nullIfBlank(order.erpnextCustomerId);
    if (fromCol) {
      bucket.add(fromCol);
      continue;
    }
    const raw = order.rawPayload;
    const nested =
      raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : raw;
    const fromPayload = nullIfBlank(typeof nested?.customer === "string" ? nested.customer : null);
    if (fromPayload) bucket.add(fromPayload);
  }
  return byInstance;
}

async function enrichOrdersForCustomer({ companyId, customerId, phone, email }) {
  if (!phone && !email) return 0;
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      erpnextCustomerId: customerId,
      OR: [
        { customerPhone: null },
        { customerPhone: "" },
        { customerEmail: null },
        { customerEmail: "" },
      ],
    },
    select: { id: true, customerPhone: true, customerEmail: true },
    take: 200,
  });

  let patched = 0;
  for (const order of orders) {
    const nextPhone = nullIfBlank(order.customerPhone) ?? phone;
    const nextEmail = nullIfBlank(order.customerEmail) ?? email;
    if (
      nextPhone === nullIfBlank(order.customerPhone) &&
      nextEmail === nullIfBlank(order.customerEmail)
    ) {
      continue;
    }
    patched++;
    if (dryRun) continue;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(nullIfBlank(order.customerPhone) ? {} : nextPhone ? { customerPhone: nextPhone } : {}),
        ...(nullIfBlank(order.customerEmail) ? {} : nextEmail ? { customerEmail: nextEmail } : {}),
      },
    });
  }
  return patched;
}

async function processInstance(companyId, instance, customerIds) {
  console.log(`\n=== ${instance.slot.toUpperCase()} (${instance.label}) ===`);
  console.log(`Distinct ERP customers referenced by Orders: ${customerIds.length}`);
  console.log(`Processing… (progress every 10 customers)`);

  let created = 0;
  let enriched = 0;
  let unchanged = 0;
  let conflicts = 0;
  let skipped = 0;
  let ordersPatched = 0;
  let fetchFailed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < customerIds.length; i++) {
    const customerId = customerIds[i];
    const n = i + 1;

    let info;
    try {
      info = await getCustomerWithContacts(instance.cfg, customerId);
    } catch (err) {
      fetchFailed++;
      console.log(`  [${n}/${customerIds.length}] ${customerId}: ERP fetch error — ${err.message?.slice(0, 120) ?? err}`);
      continue;
    }

    if (!info) {
      fetchFailed++;
      if (n % 10 === 0 || n === customerIds.length) {
        console.log(`  [${n}/${customerIds.length}] progress (fetchFailed=${fetchFailed})`);
      }
      continue;
    }

    const phone = info.mobileNo ?? info.phones[0] ?? null;
    const email = info.emailId ?? info.emails[0] ?? null;
    if (!phone && !email) {
      skipped++;
      if (n % 10 === 0 || n === customerIds.length) {
        console.log(`  [${n}/${customerIds.length}] progress`);
      }
      continue;
    }

    if (dryRun) {
      console.log(
        `○ would sync ${customerId}: name=${info.customerName ?? "—"} phone=${phone ?? "—"} email=${email ?? "—"}`,
      );
    }

    const result = await syncContactMaster({
      companyId,
      source: instance.slot,
      email,
      phoneNumber: phone,
      name: info.customerName,
    });

    if (result.status === "created") created++;
    else if (result.status === "enriched") enriched++;
    else if (result.status === "unchanged") unchanged++;
    else if (result.status === "conflict") conflicts++;
    else skipped++;

    ordersPatched += await enrichOrdersForCustomer({
      companyId,
      customerId,
      phone,
      email,
    });

    if (!dryRun && (n % 10 === 0 || n === customerIds.length)) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(
        `  [${n}/${customerIds.length}] ${elapsed}s — created=${created} enriched=${enriched} unchanged=${unchanged} conflicts=${conflicts} patched=${ordersPatched} failed=${fetchFailed}`,
      );
    }
  }

  console.log(
    `[${instance.slot}] DONE contacts created=${created} enriched=${enriched} unchanged=${unchanged} ` +
      `conflicts=${conflicts} skipped=${skipped} fetchFailed=${fetchFailed} ordersPatched=${ordersPatched}`,
  );
}

const companyId = await resolveCompanyId();
const instances = await loadInstances(companyId);
if (instances.length === 0) {
  console.error("No ERP1/ERP2 instances configured for this company");
  process.exit(1);
}

console.log(`Company: ${companyId}`);
console.log(`Instances: ${instances.map((i) => i.slot).join(", ")}`);
if (dryRun) console.log("Mode: DRY RUN");

const byInstance = await loadCustomerIdsByInstance(companyId, instances);
for (const instance of instances) {
  const ids = [...(byInstance.get(instance.id) ?? [])];
  await processInstance(companyId, instance, ids);
}

await prisma.$disconnect();
