/**
 * One-time copy of Cosmo OS supplement purchase lines into Vault OS contacts.
 * Reads .env.cosmo-prod and .env.vault. Does not print credentials.
 *
 *   npx tsx scripts/transfer-vault-supplement-contacts.ts           # count only
 *   npx tsx scripts/transfer-vault-supplement-contacts.ts --apply   # write Vault
 */
import { readFileSync } from "node:fs";

import { Prisma, PrismaClient } from "@prisma/client";
import { parse } from "dotenv";

import { formatAppIsoDate, parseAppCalendarDayStart } from "../lib/format-datetime";
import { buildPhoneLookupVariants, canonicalPhoneForErpCustomerId } from "../lib/phone-lookup";
import { isVaultOsfForceIncludedSku, VAULT_OSF_FORCE_INCLUDED_SKUS } from "../lib/vault-osf/sku-policy";

const APPLY = process.argv.includes("--apply");
const PAGE = 250;

function databaseUrl(file: string): string {
  const env = parse(readFileSync(file));
  const url = env.DIRECT_URL || env.DATABASE_URL;
  if (!url) throw new Error(`No DIRECT_URL or DATABASE_URL in ${file}`);
  return url;
}

const cosmo = new PrismaClient({ datasources: { db: { url: databaseUrl(".env.cosmo-prod") } } });
const vault = new PrismaClient({ datasources: { db: { url: databaseUrl(".env.vault") } } });

type ErpCfg = { baseUrl: string; apiKey: string; apiSecret: string };

type DraftLine = {
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
};

type DraftInvoice = {
  key: string;
  invoiceNo: string;
  invoiceDate: Date;
  currency: string;
  paymentMethod: string | null;
  location: string | null;
  merchant: string | null;
  lines: Map<string, DraftLine>;
};

type DraftCustomer = {
  phone: string | null;
  email: string | null;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  invoices: Map<string, DraftInvoice>;
};

type VaultContact = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  lastPurchaseAt: Date | null;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed ? trimmed.slice(0, 254) : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return canonicalPhoneForErpCustomerId(trimmed) ?? trimmed.slice(0, 32);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function canonCode(code: string): string {
  return code.trim().toUpperCase().replace(/_/g, "-").replace(/\*OI$/i, "-1");
}

function buildCodeLookup(codes: Set<string>): Map<string, string> {
  const byNorm = new Map<string, string>();
  for (const code of codes) {
    const key = canonCode(code);
    if (!byNorm.has(key)) byNorm.set(key, code);
  }
  return byNorm;
}

function resolveItemCode(raw: string | null | undefined, codes: Set<string>, byNorm: Map<string, string>): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed || /^(shipping|coupon|fee)$/i.test(trimmed)) return null;
  if (codes.has(trimmed)) return trimmed;
  return byNorm.get(canonCode(trimmed)) ?? null;
}

function invoiceKey(sourceRef: string, invoiceNo: string): string {
  return `vsupp:${sourceRef}|${invoiceNo}`;
}

function colomboDay(value: Date): Date {
  return parseAppCalendarDayStart(formatAppIsoDate(value)) ?? value;
}

function customerNameFromOrder(order: {
  name: string | null;
  shippingAddress: unknown;
  customer: { firstName: string | null; lastName: string | null } | null;
}): string | null {
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const shipping = order.shippingAddress as Record<string, unknown>;
    const combined = [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim();
    const raw = text(shipping.name) ?? (combined || null);
    if (raw) return raw;
  }
  const fromCustomer = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ").trim();
  return fromCustomer || text(order.name);
}

function addressFromShipping(raw: unknown): { address: string | null; city: string | null } {
  if (!raw || typeof raw !== "object") return { address: null, city: null };
  const shipping = raw as Record<string, unknown>;
  return {
    address: text(shipping.address1) ?? text(shipping.address),
    city: text(shipping.city),
  };
}

function prefer(current: string | null, next: string | null): string | null {
  return next?.trim() ? next.trim() : current;
}

async function pickCompany(
  client: PrismaClient,
  preferName: (name: string) => boolean,
  label: string,
): Promise<{ id: string; name: string }> {
  const companies = await client.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (companies.length === 0) throw new Error(`No company on ${label}`);
  const preferred = companies.filter((company) => preferName(company.name));
  const chosen = preferred.length === 1 ? preferred[0] : companies.length === 1 ? companies[0] : null;
  if (!chosen) {
    throw new Error(
      `${label} company is ambiguous: ${companies.map((company) => company.name).join(", ")}`,
    );
  }
  return chosen;
}

async function erpGet(cfg: ErpCfg, path: string): Promise<{ data?: unknown }> {
  const response = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ERP GET failed [${response.status}] ${body.slice(0, 180)}`);
  }
  return (await response.json()) as { data?: unknown };
}

function keepItem(row: { item_code?: string; name?: string; disabled?: number | boolean; is_stock_item?: number | boolean }): string | null {
  const code = (row.item_code ?? row.name ?? "").trim();
  if (!code) return null;
  if (code.toUpperCase() === "DELIVERY-CHARGES" || code.toUpperCase() === "TEST") return null;
  if (!isVaultOsfForceIncludedSku(code) && (row.disabled === 1 || row.disabled === true)) return null;
  if (!(row.is_stock_item === 1 || row.is_stock_item === true)) return null;
  return code;
}

async function fetchErpCodes(cfg: ErpCfg): Promise<Set<string>> {
  const codes = new Set<string>();
  const fields = encodeURIComponent(JSON.stringify(["name", "item_code", "disabled", "is_stock_item"]));
  const filters = encodeURIComponent(JSON.stringify([["disabled", "=", 0], ["is_stock_item", "=", 1]]));
  for (let page = 0; page < 80; page += 1) {
    const json = await erpGet(
      cfg,
      `/api/resource/Item?fields=${fields}&filters=${filters}&limit_start=${page * 500}&limit_page_length=500`,
    );
    const rows = Array.isArray(json.data) ? json.data : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const code = keepItem(row as { item_code?: string; name?: string; disabled?: number | boolean; is_stock_item?: number | boolean });
      if (code) codes.add(code);
    }
    if (rows.length < 500) break;
  }
  for (const sku of VAULT_OSF_FORCE_INCLUDED_SKUS) {
    if (codes.has(sku)) continue;
    try {
      const json = await erpGet(cfg, `/api/resource/Item/${encodeURIComponent(sku)}`);
      const row = json.data;
      if (!row || typeof row !== "object") continue;
      const code = keepItem(row as { item_code?: string; name?: string; disabled?: number | boolean; is_stock_item?: number | boolean });
      if (code) codes.add(code);
    } catch {
      // Missing on this ERP.
    }
  }
  return codes;
}

function indexByPhone<T extends { id?: string }>(rows: T[], phoneOf: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const phone = normalizePhone(phoneOf(row));
    if (!phone) continue;
    const seen = new Set<string>();
    for (const variant of buildPhoneLookupVariants(phone)) {
      if (seen.has(variant)) continue;
      seen.add(variant);
      const list = map.get(variant) ?? [];
      if (!list.includes(row)) list.push(row);
      map.set(variant, list);
    }
  }
  return map;
}

function matchOne<T extends { id: string }>(
  phone: string | null,
  email: string | null,
  byPhone: Map<string, T[]>,
  byEmail: Map<string, T[]>,
): T | "many" | null {
  const phoneHits = new Map<string, T>();
  if (phone) {
    for (const variant of buildPhoneLookupVariants(phone)) {
      for (const row of byPhone.get(variant) ?? []) phoneHits.set(row.id, row);
    }
  }
  if (phoneHits.size > 1) return "many";
  if (phoneHits.size === 1) return [...phoneHits.values()][0]!;
  const emailHits = new Map<string, T>();
  for (const row of email ? byEmail.get(email) ?? [] : []) emailHits.set(row.id, row);
  if (emailHits.size > 1) return "many";
  if (emailHits.size === 1) return [...emailHits.values()][0]!;
  return null;
}

function addLine(customers: Map<string, DraftCustomer>, input: {
  phone: string | null;
  email: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  sourceRef: string;
  invoiceNo: string;
  invoiceDate: Date;
  currency: string | null;
  paymentMethod: string | null;
  location: string | null;
  merchant: string | null;
  line: DraftLine;
}): "ok" | "skip" {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const name = input.name?.trim() ?? "";
  if (!phone && !email) return "skip";
  if (!name) return "skip";
  const key = phone ? `phone:${phone}` : `email:${email}`;
  let customer = customers.get(key);
  if (!customer) {
    customer = {
      phone,
      email,
      name,
      address: input.address,
      city: input.city,
      district: input.district,
      invoices: new Map(),
    };
    customers.set(key, customer);
  } else {
    customer.name = name || customer.name;
    customer.phone = customer.phone ?? phone;
    customer.email = customer.email ?? email;
    customer.address = prefer(customer.address, input.address);
    customer.city = prefer(customer.city, input.city);
    customer.district = prefer(customer.district, input.district);
  }
  const adaptKey = invoiceKey(input.sourceRef, input.invoiceNo);
  let invoice = customer.invoices.get(adaptKey);
  if (!invoice) {
    invoice = {
      key: adaptKey,
      invoiceNo: input.invoiceNo,
      invoiceDate: input.invoiceDate,
      currency: input.currency?.trim() || "LKR",
      paymentMethod: input.paymentMethod,
      location: input.location,
      merchant: input.merchant,
      lines: new Map(),
    };
    customer.invoices.set(adaptKey, invoice);
  }
  invoice.lines.set(input.line.itemCode, input.line);
  if (input.invoiceDate > invoice.invoiceDate) invoice.invoiceDate = input.invoiceDate;
  invoice.currency = input.currency?.trim() || invoice.currency;
  invoice.paymentMethod = input.paymentMethod ?? invoice.paymentMethod;
  invoice.location = input.location ?? invoice.location;
  invoice.merchant = input.merchant ?? invoice.merchant;
  return "ok";
}

async function main() {
  const cosmoCompany = await pickCompany(cosmo, (name) => /cosmetic/i.test(name), "Cosmo");
  const vaultCompany = await pickCompany(vault, (name) => /supplement/i.test(name), "Vault");
  console.log(`Cosmo company: ${cosmoCompany.name}`);
  console.log(`Vault company: ${vaultCompany.name}`);

  const instances = await vault.erpnextInstance.findMany({
    where: { companyId: vaultCompany.id },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });
  const configs = instances
    .filter((row) => row.baseUrl && row.apiKey && row.apiSecret)
    .map((row) => ({
      baseUrl: row.baseUrl.replace(/\/$/, ""),
      apiKey: row.apiKey,
      apiSecret: row.apiSecret,
      label: row.label,
    }));
  if (configs.length === 0) throw new Error("Vault company has no ERP credentials");

  const itemCodes = new Set<string>();
  for (const cfg of configs) {
    const codes = await fetchErpCodes(cfg);
    console.log(`ERP ${cfg.label}: ${codes.size} stock item codes`);
    for (const code of codes) itemCodes.add(code);
  }
  const codeLookup = buildCodeLookup(itemCodes);
  console.log(`Item codes combined: ${itemCodes.size}`);
  if (itemCodes.size < 50) throw new Error("ERP item list is too small. Nothing written.");

  const cosmoContacts = await cosmo.contactMaster.findMany({
    where: { companyId: cosmoCompany.id },
    select: { id: true, name: true, phoneNumber: true, email: true, address: true, city: true, district: true },
  });
  const cosmoByPhone = indexByPhone(cosmoContacts, (row) => row.phoneNumber);
  const cosmoByEmail = new Map<string, typeof cosmoContacts>();
  for (const contact of cosmoContacts) {
    const email = normalizeEmail(contact.email);
    if (!email) continue;
    const list = cosmoByEmail.get(email) ?? [];
    list.push(contact);
    cosmoByEmail.set(email, list);
  }
  console.log(`Cosmo contacts indexed: ${cosmoContacts.length}`);

  const customers = new Map<string, DraftCustomer>();
  let skipped = 0;
  let ordersRead = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await cosmo.order.findMany({
      where: {
        companyId: cosmoCompany.id,
        cancelledAt: null,
        NOT: { financialStatus: { equals: "voided", mode: "insensitive" } },
      },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        orderNumber: true,
        name: true,
        createdAt: true,
        currency: true,
        customerPhone: true,
        customerEmail: true,
        district: true,
        shippingAddress: true,
        paymentGatewayPrimary: true,
        customer: { select: { firstName: true, lastName: true } },
        companyLocation: { select: { name: true } },
        assignedMerchant: { select: { knownName: true, name: true } },
        lineItems: { select: { quantity: true, price: true, productItem: { select: { sku: true, productTitle: true } } } },
      },
    });
    if (batch.length === 0) break;
    ordersRead += batch.length;
    for (const order of batch) {
      const lines = order.lineItems.flatMap((line) => {
        const sku = resolveItemCode(line.productItem.sku, itemCodes, codeLookup);
        if (!sku || line.quantity <= 0) return [];
        return [{ ...line, sku }];
      });
      if (lines.length === 0) continue;
      const matched = matchOne(normalizePhone(order.customerPhone), normalizeEmail(order.customerEmail), cosmoByPhone, cosmoByEmail);
      const profile = matched && matched !== "many" ? matched : null;
      const shipping = addressFromShipping(order.shippingAddress);
      for (const line of lines) {
        const sku = line.sku;
        const unitPrice = Number(line.price);
        const result = addLine(customers, {
          phone: profile?.phoneNumber ?? order.customerPhone,
          email: profile?.email ?? order.customerEmail,
          name: profile?.name ?? customerNameFromOrder(order),
          address: profile?.address ?? shipping.address,
          city: profile?.city ?? shipping.city,
          district: profile?.district ?? order.district,
          sourceRef: order.id,
          invoiceNo: order.orderNumber?.trim() || order.name?.trim() || order.id,
          invoiceDate: colomboDay(order.createdAt),
          currency: order.currency,
          paymentMethod: order.paymentGatewayPrimary,
          location: order.companyLocation.name,
          merchant: order.assignedMerchant?.knownName?.trim() || order.assignedMerchant?.name?.trim() || null,
          line: {
            itemCode: sku,
            itemName: line.productItem.productTitle?.trim() || sku,
            quantity: line.quantity,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            lineAmount: roundMoney(line.quantity * (Number.isFinite(unitPrice) ? unitPrice : 0)),
          },
        });
        if (result === "skip") skipped += 1;
      }
    }
    cursor = batch[batch.length - 1]!.id;
    if (ordersRead % 5000 === 0) console.log(`Orders read: ${ordersRead}`);
    if (batch.length < PAGE) break;
  }

  let adaptRead = 0;
  cursor = undefined;
  for (;;) {
    const batch = await cosmo.adaptPurchaseHistory.findMany({
      where: { companyId: cosmoCompany.id },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        adaptInvoiceKey: true,
        salesInvoiceNo: true,
        invoiceDate: true,
        currency: true,
        paymentMethod: true,
        locationName: true,
        merchantKnownName: true,
        lineItems: true,
        contact: { select: { name: true, phoneNumber: true, email: true, address: true, city: true, district: true } },
      },
    });
    if (batch.length === 0) break;
    adaptRead += batch.length;
    for (const row of batch) {
      if (!Array.isArray(row.lineItems)) continue;
      for (const entry of row.lineItems) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const itemCode = resolveItemCode(text(item.itemCode) ?? text(item.item_code), itemCodes, codeLookup);
        if (!itemCode) continue;
        const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        const priceRaw = item.unitPrice ?? item.unit_price;
        const unitPrice = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
        const safePrice = Number.isFinite(unitPrice) ? unitPrice : 0;
        const result = addLine(customers, {
          phone: row.contact.phoneNumber,
          email: row.contact.email,
          name: row.contact.name,
          address: row.contact.address,
          city: row.contact.city,
          district: row.contact.district,
          sourceRef: row.adaptInvoiceKey,
          invoiceNo: row.salesInvoiceNo,
          invoiceDate: colomboDay(row.invoiceDate),
          currency: row.currency,
          paymentMethod: row.paymentMethod,
          location: row.locationName,
          merchant: row.merchantKnownName,
          line: {
            itemCode,
            itemName: text(item.itemName) ?? text(item.item_name) ?? itemCode,
            quantity,
            unitPrice: safePrice,
            lineAmount: roundMoney(quantity * safePrice),
          },
        });
        if (result === "skip") skipped += 1;
      }
    }
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < PAGE) break;
  }

  let invoices = 0;
  let lines = 0;
  for (const customer of customers.values()) {
    invoices += customer.invoices.size;
    for (const invoice of customer.invoices.values()) lines += invoice.lines.size;
  }
  console.log(
    JSON.stringify({
      ordersRead,
      adaptRead,
      customers: customers.size,
      invoices,
      lines,
      skipped,
      apply: APPLY,
    }),
  );
  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write Vault OS.");
    return;
  }
  if (customers.size === 0 || lines === 0) throw new Error("Nothing to copy.");

  const vaultContacts = await vault.contactMaster.findMany({
    where: { companyId: vaultCompany.id },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      address: true,
      city: true,
      district: true,
      lastPurchaseAt: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });
  const vaultPhoneRows: VaultContact[] = [];
  for (const contact of vaultContacts) {
    vaultPhoneRows.push(contact);
    for (const phone of contact.phones) {
      vaultPhoneRows.push({ ...contact, phoneNumber: phone.phoneNumber });
    }
  }
  const vaultByPhone = indexByPhone(vaultPhoneRows, (row) => row.phoneNumber);
  const vaultByEmail = new Map<string, VaultContact[]>();
  for (const contact of vaultContacts) {
    const emails = [contact.email, ...contact.emails.map((row) => row.email)];
    for (const raw of emails) {
      const email = normalizeEmail(raw);
      if (!email) continue;
      const list = vaultByEmail.get(email) ?? [];
      if (!list.some((row) => row.id === contact.id)) list.push(contact);
      vaultByEmail.set(email, list);
    }
  }

  const importBatchId = `vsupp-direct-${Date.now()}`;
  let created = 0;
  let matched = 0;
  let ambiguous = 0;
  let linesAdded = 0;
  let linesUpdated = 0;
  const touched: string[] = [];
  let done = 0;

  for (const customer of customers.values()) {
    done += 1;
    const hit = matchOne(customer.phone, customer.email, vaultByPhone, vaultByEmail);
    if (hit === "many") {
      ambiguous += 1;
      continue;
    }
    const latest = [...customer.invoices.values()].reduce(
      (max, invoice) => (invoice.invoiceDate > max ? invoice.invoiceDate : max),
      [...customer.invoices.values()][0]!.invoiceDate,
    );
    let contactId: string;
    if (!hit) {
      const createdRow = await vault.contactMaster.create({
        data: {
          companyId: vaultCompany.id,
          name: customer.name,
          phoneNumber: customer.phone,
          email: customer.email,
          address: customer.address,
          city: customer.city,
          district: customer.district,
          source: "vault-supplement-import",
          osRegistrationCreated: false,
          lastPurchaseAt: latest,
        },
        select: { id: true },
      });
      contactId = createdRow.id;
      created += 1;
      const stored: VaultContact = {
        id: contactId,
        name: customer.name,
        phoneNumber: customer.phone,
        email: customer.email,
        address: customer.address,
        city: customer.city,
        district: customer.district,
        lastPurchaseAt: latest,
      };
      if (customer.phone) {
        for (const variant of buildPhoneLookupVariants(customer.phone)) {
          const list = vaultByPhone.get(variant) ?? [];
          list.push(stored);
          vaultByPhone.set(variant, list);
        }
      }
      if (customer.email) {
        const list = vaultByEmail.get(customer.email) ?? [];
        list.push(stored);
        vaultByEmail.set(customer.email, list);
      }
    } else {
      contactId = hit.id;
      matched += 1;
      const data: Prisma.ContactMasterUpdateInput = {};
      if (!hit.name?.trim() && customer.name) data.name = customer.name;
      if (!hit.phoneNumber && customer.phone) data.phoneNumber = customer.phone;
      if (!hit.email && customer.email) data.email = customer.email;
      if (!hit.address && customer.address) data.address = customer.address;
      if (!hit.city && customer.city) data.city = customer.city;
      if (!hit.district && customer.district) data.district = customer.district;
      if (!hit.lastPurchaseAt || latest > hit.lastPurchaseAt) data.lastPurchaseAt = latest;
      if (Object.keys(data).length > 0) {
        await vault.contactMaster.update({ where: { id: contactId }, data });
      }
    }
    if (customer.phone) {
      const variants = buildPhoneLookupVariants(customer.phone);
      const existingPhone = await vault.contactPhone.findFirst({
        where: { contactId, phoneNumber: { in: variants.length ? variants : [customer.phone] } },
        select: { id: true },
      });
      if (!existingPhone) {
        await vault.contactPhone.create({ data: { contactId, phoneNumber: customer.phone, isPrimary: true } });
      }
    }
    if (customer.email) {
      const existingEmail = await vault.contactEmail.findFirst({
        where: { contactId, email: { equals: customer.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (!existingEmail) {
        await vault.contactEmail.create({ data: { contactId, email: customer.email, isPrimary: true } });
      }
    }

    for (const invoice of customer.invoices.values()) {
      const existing = await vault.adaptPurchaseHistory.findUnique({
        where: { companyId_adaptInvoiceKey: { companyId: vaultCompany.id, adaptInvoiceKey: invoice.key } },
        select: { lineItems: true },
      });
      const stored = new Map<string, DraftLine>();
      if (Array.isArray(existing?.lineItems)) {
        for (const entry of existing.lineItems) {
          if (!entry || typeof entry !== "object") continue;
          const item = entry as Record<string, unknown>;
          const itemCode = text(item.itemCode);
          if (!itemCode) continue;
          const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
          const unitPrice = Number(item.unitPrice ?? 0);
          const lineAmount = Number(item.lineAmount ?? quantity * unitPrice);
          stored.set(itemCode, {
            itemCode,
            itemName: text(item.itemName) ?? itemCode,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            lineAmount: Number.isFinite(lineAmount) ? lineAmount : 0,
          });
        }
      }
      for (const line of invoice.lines.values()) {
        if (stored.has(line.itemCode)) linesUpdated += 1;
        else linesAdded += 1;
        stored.set(line.itemCode, line);
      }
      const lineItems = [...stored.values()].map((line) => ({
        id: `${invoice.key}:${line.itemCode}`,
        itemCode: line.itemCode,
        itemName: line.itemName,
        quantity: line.quantity,
        unitPrice: String(line.unitPrice),
        lineAmount: String(roundMoney(line.lineAmount)),
        itemId: null,
      }));
      const ttlAmount = new Prisma.Decimal(roundMoney(lineItems.reduce((sum, line) => sum + Number(line.lineAmount), 0)).toFixed(2));
      const data = {
        contactId,
        salesInvoiceNo: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate,
        ttlAmount,
        currency: invoice.currency,
        locationName: invoice.location,
        paymentMethod: invoice.paymentMethod,
        merchantKnownName: invoice.merchant,
        lineItems,
        importBatchId,
        origin: "vault_supplement_import",
      };
      if (existing) {
        await vault.adaptPurchaseHistory.update({
          where: { companyId_adaptInvoiceKey: { companyId: vaultCompany.id, adaptInvoiceKey: invoice.key } },
          data,
        });
      } else {
        await vault.adaptPurchaseHistory.create({
          data: { companyId: vaultCompany.id, adaptInvoiceKey: invoice.key, ...data },
        });
      }
    }
    touched.push(contactId);
    if (done % 200 === 0) console.log(`Customers written: ${done}/${customers.size}`);
  }

  let summaries = 0;
  for (const contactId of touched) {
    const contact = await vault.contactMaster.findUnique({
      where: { id: contactId },
      select: { phoneNumber: true, email: true },
    });
    if (!contact) continue;
    const phones = contact.phoneNumber ? buildPhoneLookupVariants(contact.phoneNumber) : [];
    const orderAgg = phones.length
      ? await vault.order.aggregate({
          where: { companyId: vaultCompany.id, customerPhone: { in: phones } },
          _count: { _all: true },
          _sum: { totalPrice: true },
          _max: { createdAt: true },
        })
      : contact.email
        ? await vault.order.aggregate({
            where: {
              companyId: vaultCompany.id,
              customerEmail: { equals: contact.email, mode: "insensitive" },
              OR: [{ customerPhone: null }, { customerPhone: "" }],
            },
            _count: { _all: true },
            _sum: { totalPrice: true },
            _max: { createdAt: true },
          })
        : null;
    const adaptAgg = await vault.adaptPurchaseHistory.aggregate({
      where: { contactId },
      _count: { _all: true },
      _sum: { ttlAmount: true },
      _max: { invoiceDate: true },
    });
    const orderSpent = Number(orderAgg?._sum.totalPrice ?? 0);
    const adaptSpent = Number(adaptAgg._sum.ttlAmount ?? 0);
    const lastCandidates = [orderAgg?._max.createdAt ?? null, adaptAgg._max.invoiceDate ?? null].filter(
      (value): value is Date => value instanceof Date,
    );
    await vault.contactMaster.update({
      where: { id: contactId },
      data: {
        purchaseOrderCount: (orderAgg?._count._all ?? 0) + adaptAgg._count._all,
        purchaseTotalValue: new Prisma.Decimal((orderSpent + adaptSpent).toFixed(2)),
        purchaseLastOrderAt: lastCandidates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      },
    });
    summaries += 1;
  }

  console.log(JSON.stringify({ created, matched, ambiguous, linesAdded, linesUpdated, summaries, importBatchId }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([cosmo.$disconnect(), vault.$disconnect()]);
  });
