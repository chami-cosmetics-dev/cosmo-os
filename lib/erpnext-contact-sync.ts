import { prisma } from "@/lib/prisma";

export type OsfErpCredentials = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type OsfErpInstance = {
  id: string;
  label: string | null;
  cfg: OsfErpCredentials;
};

export class OsfErpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OsfErpError";
  }
}

export type ErpContactSlot = "erp1" | "erp2";

export type ErpInstanceForContactSync = OsfErpInstance & {
  slot: ErpContactSlot;
  incomingWebhookSecret: string | null;
};

export type ErpSalesInvoiceListRow = {
  name: string;
  customer: string | null;
  customer_name: string | null;
  company: string | null;
  posting_date: string | null;
  grand_total: number | null;
  docstatus: number | null;
  is_pos: number | null;
  is_return: number | null;
  contact_email: string | null;
  contact_mobile: string | null;
};

export type ErpCustomerContactInfo = {
  customerId: string;
  customerName: string | null;
  mobileNo: string | null;
  emailId: string | null;
  phones: string[];
  emails: string[];
};

const PAGE_SIZE = 200;
const MAX_PAGES = 500;

function resolveErpSlots(instances: Array<{ id: string; label: string | null }>): {
  erp1: { id: string; label: string | null } | null;
  erp2: { id: string; label: string | null } | null;
} {
  const erp1Match = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2Match = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  if (erp1Match || erp2Match) {
    return { erp1: erp1Match ?? null, erp2: erp2Match ?? null };
  }
  return {
    erp1: instances[0] ?? null,
    erp2: instances[1] ?? null,
  };
}

function authHeaders(cfg: OsfErpCredentials): Record<string, string> {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
  };
}

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: authHeaders(cfg),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Map instance label to ContactMaster.source value (erp1 / erp2). */
export function erpSlotSourceFromLabel(label: string | null | undefined): ErpContactSlot | null {
  if (!label?.trim()) return null;
  if (/erp[_\s-]*1\b/i.test(label)) return "erp1";
  if (/erp[_\s-]*2\b/i.test(label)) return "erp2";
  return null;
}

export function erpSlotSourceFromSlot(slot: ErpContactSlot): ErpContactSlot {
  return slot;
}

/**
 * Resolve ERP1/ERP2 instances for a Cosmo company (credentials + webhook secret).
 */
export async function getErpContactSyncInstances(
  companyId: string,
): Promise<ErpInstanceForContactSync[]> {
  const rows = await prisma.erpnextInstance.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      apiSecret: true,
      incomingWebhookSecret: true,
    },
  });

  const usable = rows.filter((i) => i.baseUrl && i.apiKey && i.apiSecret);
  const slots = resolveErpSlots(usable.map((i) => ({ id: i.id, label: i.label })));

  const result: ErpInstanceForContactSync[] = [];
  for (const slot of ["erp1", "erp2"] as const) {
    const matched = slots[slot];
    if (!matched) continue;
    const row = usable.find((i) => i.id === matched.id);
    if (!row) continue;
    result.push({
      id: row.id,
      label: row.label,
      slot,
      incomingWebhookSecret: row.incomingWebhookSecret,
      cfg: {
        baseUrl: row.baseUrl.replace(/\/$/, ""),
        apiKey: row.apiKey,
        apiSecret: row.apiSecret,
      },
    });
  }
  return result;
}

export type ListSubmittedSalesInvoicesOptions = {
  company?: string | null;
  since?: string | null;
  pageSize?: number;
  maxPages?: number;
};

/**
 * Paginate submitted, non-return Sales Invoices from an ERP instance.
 */
export async function listSubmittedSalesInvoices(
  cfg: OsfErpCredentials,
  options: ListSubmittedSalesInvoicesOptions = {},
): Promise<ErpSalesInvoiceListRow[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const fields = JSON.stringify([
    "name",
    "customer",
    "customer_name",
    "company",
    "posting_date",
    "grand_total",
    "docstatus",
    "is_pos",
    "is_return",
    "contact_email",
    "contact_mobile",
  ]);

  const all: ErpSalesInvoiceListRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const filters: unknown[][] = [
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
    ];
    if (options.company?.trim()) {
      filters.unshift(["company", "=", options.company.trim()]);
    }
    if (options.since?.trim()) {
      filters.push(["posting_date", ">=", options.since.trim()]);
    }

    const path =
      `/api/resource/Sales%20Invoice?filters=${encodeURIComponent(JSON.stringify(filters))}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit_page_length=${pageSize}&limit_start=${page * pageSize}&order_by=creation asc`;

    const json = await erpGetJson<{ data?: ErpSalesInvoiceListRow[] }>(cfg, path);
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

export async function fetchSalesInvoiceDoc(
  cfg: OsfErpCredentials,
  name: string,
): Promise<Record<string, unknown> | null> {
  try {
    const json = await erpGetJson<{ data?: Record<string, unknown> }>(
      cfg,
      `/api/resource/Sales%20Invoice/${encodeURIComponent(name)}`,
    );
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function listContactsForCustomer(
  cfg: OsfErpCredentials,
  customerId: string,
): Promise<Array<{ mobile_no?: string | null; phone?: string | null; email_id?: string | null }>> {
  const filters = JSON.stringify([
    ["Dynamic Link", "link_doctype", "=", "Customer"],
    ["Dynamic Link", "link_name", "=", customerId],
  ]);
  const fields = JSON.stringify(["name", "first_name", "last_name", "mobile_no", "phone", "email_id"]);
  const path =
    `/api/resource/Contact?filters=${encodeURIComponent(filters)}` +
    `&fields=${encodeURIComponent(fields)}&limit_page_length=50`;
  try {
    const json = await erpGetJson<{
      data?: Array<{ mobile_no?: string | null; phone?: string | null; email_id?: string | null }>;
    }>(cfg, path);
    return json.data ?? [];
  } catch {
    return [];
  }
}

function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.toLowerCase() === "none") return null;
  return trimmed;
}

/**
 * Load ERP Customer + linked Contact phones/emails.
 */
export async function getCustomerWithContacts(
  cfg: OsfErpCredentials,
  customerId: string,
): Promise<ErpCustomerContactInfo | null> {
  const id = customerId.trim();
  if (!id) return null;

  let customer: {
    name?: string;
    customer_name?: string | null;
    mobile_no?: string | null;
    email_id?: string | null;
  } | null = null;

  try {
    const json = await erpGetJson<{
      data?: {
        name?: string;
        customer_name?: string | null;
        mobile_no?: string | null;
        email_id?: string | null;
      };
    }>(cfg, `/api/resource/Customer/${encodeURIComponent(id)}`);
    customer = json.data ?? null;
  } catch {
    return null;
  }

  if (!customer) return null;

  const contacts = await listContactsForCustomer(cfg, id);
  const phones = new Set<string>();
  const emails = new Set<string>();

  const customerMobile = nullIfBlank(customer.mobile_no);
  const customerEmail = nullIfBlank(customer.email_id);
  if (customerMobile) phones.add(customerMobile);
  if (customerEmail) emails.add(customerEmail.toLowerCase());

  for (const contact of contacts) {
    const mobile = nullIfBlank(contact.mobile_no);
    const phone = nullIfBlank(contact.phone);
    const email = nullIfBlank(contact.email_id);
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
