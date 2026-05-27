import type { Order, CompanyLocation } from "@prisma/client";
import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";

const BASE_URL = (process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
const API_KEY = process.env.ERPNEXT_API_KEY ?? "";
const API_SECRET = process.env.ERPNEXT_API_SECRET ?? "";

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${API_KEY}:${API_SECRET}`,
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function erpnextPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext POST ${path} [${res.status}]: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}


async function erpnextGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function ensureCustomer(
  customerName: string,
  email: string | null,
  phone: string | null,
  erpnextCompany: string,
): Promise<void> {
  const encoded = encodeURIComponent(customerName);
  const existing = await erpnextGet(`/api/resource/Customer/${encoded}`);
  if (existing) return;

  await erpnextPost("/api/resource/Customer", {
    doctype: "Customer",
    customer_name: customerName,
    customer_type: "Individual",
    customer_group: "Individual",
    territory: "All Territories",
    default_company: erpnextCompany,
    custom_total_purchasing_value: 0,
    ...(email ? { email_id: email } : {}),
    ...(phone ? { mobile_no: phone } : {}),
  });
}

async function createKokoPaymentEntry(
  invoiceName: string,
  company: string,
  customerName: string,
  debitTo: string,
  totalAmount: number,
  dateStr: string,
): Promise<void> {
  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(`/api/resource/Mode%20of%20Payment/Koko`);

  const kokoAccount = mop?.accounts?.find((a) => a.company === company)?.default_account;
  if (!kokoAccount) {
    throw new Error(`No account mapped for Koko mode of payment under company "${company}"`);
  }

  const pe = await erpnextPost<{ name: string }>("/api/resource/Payment Entry", {
    doctype: "Payment Entry",
    payment_type: "Receive",
    company,
    posting_date: dateStr,
    mode_of_payment: mop.name,
    party_type: "Customer",
    party: customerName,
    paid_from: debitTo,
    paid_to: kokoAccount,
    reference_no: invoiceName,
    reference_date: dateStr,
    paid_amount: totalAmount,
    received_amount: totalAmount,
    source_exchange_rate: 1,
    target_exchange_rate: 1,
    references: [
      {
        reference_doctype: "Sales Invoice",
        reference_name: invoiceName,
        allocated_amount: totalAmount,
      },
    ],
    docstatus: 1,
  });

  console.log(`[ERPNext] Payment Entry ${pe.name} created for Sales Invoice ${invoiceName} (Koko)`);
}

export async function syncBankTransferPaymentToERPNext(
  orderPoNo: string,
  location: CompanyLocation,
  dateStr: string,
): Promise<void> {
  if (!BASE_URL || !API_KEY || !API_SECRET) return;
  if (!location.erpnextCompany || !location.erpnextWarehouse) return;

  const filters = encodeURIComponent(
    JSON.stringify([
      ["po_no", "=", orderPoNo],
      ["company", "=", location.erpnextCompany],
      ["docstatus", "=", "1"],
    ]),
  );
  const fields = encodeURIComponent(
    JSON.stringify(["name", "outstanding_amount", "debit_to", "customer"]),
  );
  const list = await erpnextGet<
    Array<{ name: string; outstanding_amount: number; debit_to: string; customer: string }>
  >(`/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`);

  if (!list || list.length === 0) {
    console.warn(`[ERPNext] No Sales Invoice found for po_no="${orderPoNo}" — skipping bank transfer payment entry`);
    return;
  }

  const invoice = list[0];
  if (invoice.outstanding_amount <= 0) {
    console.log(`[ERPNext] Sales Invoice ${invoice.name} already fully paid — skipping`);
    return;
  }

  const mopName = process.env.ERPNEXT_BANK_TRANSFER_MOP ?? "Wire Transfer";
  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(`/api/resource/Mode%20of%20Payment/${encodeURIComponent(mopName)}`);

  if (!mop) {
    throw new Error(`ERPNext Mode of Payment "${mopName}" not found`);
  }

  const paidTo = mop.accounts.find((a) => a.company === location.erpnextCompany)?.default_account;
  if (!paidTo) {
    throw new Error(`No account mapped for "${mopName}" under company "${location.erpnextCompany}"`);
  }

  const pe = await erpnextPost<{ name: string }>("/api/resource/Payment Entry", {
    doctype: "Payment Entry",
    payment_type: "Receive",
    company: location.erpnextCompany,
    posting_date: dateStr,
    mode_of_payment: mop.name,
    party_type: "Customer",
    party: invoice.customer,
    paid_from: invoice.debit_to,
    paid_to: paidTo,
    reference_no: invoice.name,
    reference_date: dateStr,
    paid_amount: invoice.outstanding_amount,
    received_amount: invoice.outstanding_amount,
    source_exchange_rate: 1,
    target_exchange_rate: 1,
    references: [
      {
        reference_doctype: "Sales Invoice",
        reference_name: invoice.name,
        allocated_amount: invoice.outstanding_amount,
      },
    ],
    docstatus: 1,
  });

  console.log(`[ERPNext] Bank Transfer Payment Entry ${pe.name} created for Sales Invoice ${invoice.name}`);
}

export async function syncOrderToERPNext(
  order: Order,
  location: CompanyLocation,
  shopifyData: ShopifyOrderWebhookPayload,
): Promise<void> {
  console.log(`[ERPNext] syncOrderToERPNext called — company=${location.erpnextCompany ?? "null"}, warehouse=${location.erpnextWarehouse ?? "null"}, BASE_URL=${BASE_URL ? "set" : "missing"}`);
  if (!BASE_URL || !API_KEY || !API_SECRET) {
    console.warn("[ERPNext] Skipping sync — ERPNEXT_BASE_URL / API_KEY / API_SECRET not configured");
    return;
  }
  if (!location.erpnextCompany || !location.erpnextWarehouse) {
    console.warn("[ERPNext] Skipping sync — erpnextCompany or erpnextWarehouse not set on location", location.id);
    return;
  }

  const lineItems = shopifyData.line_items.filter((li) => li.quantity > 0);
  if (lineItems.length === 0) return;

  const customerName =
    shopifyData.billing_address?.name?.trim() ||
    [shopifyData.customer?.first_name, shopifyData.customer?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    shopifyData.contact_email ||
    shopifyData.email ||
    "Guest";

  const customerEmail =
    shopifyData.contact_email || shopifyData.email || shopifyData.customer?.email || null;
  const customerPhone =
    shopifyData.billing_address?.phone || shopifyData.customer?.phone || null;

  await ensureCustomer(customerName, customerEmail, customerPhone, location.erpnextCompany);

  const dateStr = toDateStr(order.createdAt);

  const siItems = lineItems.map((li) => ({
    item_code: li.sku ?? String(li.variant_id ?? li.id),
    item_name: li.title ?? undefined,
    qty: li.quantity,
    rate: parseFloat(li.price),
    warehouse: location.erpnextWarehouse,
  }));

  const taxesAndCharges = process.env.ERPNEXT_TAXES_AND_CHARGES ?? "";
  const shippingRule = process.env.ERPNEXT_SHIPPING_RULE ?? "";

  const si = await erpnextPost<{ name: string; debit_to: string; grand_total: number }>("/api/resource/Sales Invoice", {
    doctype: "Sales Invoice",
    company: location.erpnextCompany,
    customer: customerName,
    posting_date: dateStr,
    po_no: (order.name ?? order.shopifyOrderId).slice(0, 140),
    update_stock: 1,
    set_warehouse: location.erpnextWarehouse,
    docstatus: 1,
    items: siItems,
    ...(taxesAndCharges ? { taxes_and_charges: taxesAndCharges } : {}),
    ...(shippingRule ? { shipping_rule: shippingRule } : {}),
  });

  console.log(
    `[ERPNext] Synced Shopify order ${order.shopifyOrderId} → Sales Invoice ${si.name}`,
  );

  const isKoko = shopifyData.payment_gateway_names?.some(
    (g) => g.toLowerCase() === "koko",
  );
  if (isKoko) {
    await createKokoPaymentEntry(si.name, location.erpnextCompany, customerName, si.debit_to, si.grand_total, dateStr);
    console.log(`[ERPNext] Sales Invoice ${si.name} marked paid via Koko`);
  }
}
