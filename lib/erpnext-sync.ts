import type { Order, CompanyLocation, ErpnextInstance } from "@prisma/client";
import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import { prisma } from "@/lib/prisma";

export type LocationWithErpInstance = CompanyLocation & {
  erpnextInstance: ErpnextInstance | null;
};

type ErpConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  cashMop: string;
  codMop: string;
  cardDeliveryMop: string;
  bankTransferMop: string;
  kokoMop: string;
  webxpayMop: string;
  taxesAndCharges: string;
  shippingRule: string;
  shippingItem: string;
};

function getErpConfig(instance: ErpnextInstance | null): ErpConfig {
  return {
    baseUrl: (instance?.baseUrl ?? process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, ""),
    apiKey: instance?.apiKey ?? process.env.ERPNEXT_API_KEY ?? "",
    apiSecret: instance?.apiSecret ?? process.env.ERPNEXT_API_SECRET ?? "",
    cashMop: instance?.cashMop ?? process.env.ERPNEXT_CASH_MOP ?? "Cash",
    codMop: instance?.codMop ?? process.env.ERPNEXT_COD_MOP ?? "Cash On Delivery",
    cardDeliveryMop: instance?.cardDeliveryMop ?? process.env.ERPNEXT_CARD_DELIVERY_MOP ?? "Credit Card",
    bankTransferMop: instance?.bankTransferMop ?? process.env.ERPNEXT_BANK_TRANSFER_MOP ?? "Wire Transfer",
    kokoMop: instance?.kokoMop ?? process.env.ERPNEXT_KOKO_MOP ?? "Koko",
    webxpayMop: instance?.webxpayMop ?? process.env.ERPNEXT_WEBXPAY_MOP ?? "",
    taxesAndCharges: instance?.taxesAndCharges ?? process.env.ERPNEXT_TAXES_AND_CHARGES ?? "",
    shippingRule: instance?.shippingRule ?? process.env.ERPNEXT_SHIPPING_RULE ?? "",
    shippingItem: instance?.shippingItem ?? process.env.ERPNEXT_SHIPPING_ITEM ?? "",
  };
}

function authHeaders(cfg: ErpConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
  };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function erpnextPost<T>(cfg: ErpConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext POST ${path} [${res.status}]: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function erpnextGet<T>(cfg: ErpConfig, path: string): Promise<T | null> {
  const res = await fetch(`${cfg.baseUrl}${path}`, { headers: authHeaders(cfg) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function ensureCustomer(
  cfg: ErpConfig,
  customerName: string,
  email: string | null,
  phone: string | null,
  erpnextCompany: string,
): Promise<void> {
  const encoded = encodeURIComponent(customerName);
  const existing = await erpnextGet(cfg, `/api/resource/Customer/${encoded}`);
  if (existing) return;

  await erpnextPost(cfg, "/api/resource/Customer", {
    doctype: "Customer",
    customer_name: customerName,
    customer_type: "Individual",
    customer_group: "Individual",
    territory: "All Territories",
    default_company: erpnextCompany,
    custom_total_purchasing_value: 0,
    ...(email ? { email_id: email } : {}),
    ...(phone ? { mobile_no: phone.slice(0, 20) } : {}),
  });
}

async function createPrepaidPaymentEntry(
  cfg: ErpConfig,
  invoiceName: string,
  company: string,
  customerName: string,
  debitTo: string,
  totalAmount: number,
  dateStr: string,
  mopName: string,
): Promise<void> {
  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(cfg, `/api/resource/Mode%20of%20Payment/${encodeURIComponent(mopName)}`);

  const paidTo = mop?.accounts?.find((a) => a.company === company)?.default_account;
  if (!paidTo) {
    throw new Error(`No account mapped for "${mopName}" mode of payment under company "${company}"`);
  }

  const pe = await erpnextPost<{ name: string }>(cfg, "/api/resource/Payment Entry", {
    doctype: "Payment Entry",
    payment_type: "Receive",
    company,
    posting_date: dateStr,
    mode_of_payment: mop.name,
    party_type: "Customer",
    party: customerName,
    paid_from: debitTo,
    paid_to: paidTo,
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

  console.log(`[ERPNext] Payment Entry ${pe.name} created for Sales Invoice ${invoiceName} (${mopName})`);
}

function detectDeliveryMop(
  cfg: ErpConfig,
  paymentGatewayPrimary: string | null,
  paymentGatewayNames: string[],
): string | null {
  const gateways = [paymentGatewayPrimary, ...paymentGatewayNames]
    .map((g) => g?.toLowerCase().trim() ?? "")
    .filter(Boolean);

  if (gateways.some((g) => g.includes("cash on delivery") || g === "cod")) {
    return cfg.codMop;
  }
  if (gateways.some((g) => g.includes("card payment on delivery") || g.includes("card on delivery") || g.includes("card_on_delivery"))) {
    return cfg.cardDeliveryMop;
  }
  if (gateways.some((g) => g === "cash" || g === "manual")) {
    return cfg.cashMop;
  }
  return null;
}

export async function createDeliveryPaymentEntry(
  order: {
    name: string | null;
    shopifyOrderId: string;
    sourceName: string | null;
    paymentGatewayPrimary: string | null;
    paymentGatewayNames: string[];
  },
  location: LocationWithErpInstance,
  completedAt: Date,
): Promise<void> {
  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) return;
  if (!location.erpnextCompany) return;

  const mopName = detectDeliveryMop(cfg, order.paymentGatewayPrimary, order.paymentGatewayNames);
  if (!mopName) {
    console.log(`[ERPNext] No delivery MOP matched for order ${order.name} — skipping PE`);
    return;
  }

  const orderPoNo = (order.name ?? order.shopifyOrderId).slice(0, 140);
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
  >(cfg, `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`);

  if (!list || list.length === 0) {
    console.warn(`[ERPNext] No submitted Sales Invoice for po_no="${orderPoNo}" — skipping delivery PE`);
    return;
  }

  const invoice = list[0];
  if (invoice.outstanding_amount <= 0) {
    console.log(`[ERPNext] Sales Invoice ${invoice.name} already fully paid — skipping delivery PE`);
    return;
  }

  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(cfg, `/api/resource/Mode%20of%20Payment/${encodeURIComponent(mopName)}`);

  if (!mop) throw new Error(`ERPNext Mode of Payment "${mopName}" not found`);

  const paidTo = mop.accounts.find((a) => a.company === location.erpnextCompany)?.default_account;
  if (!paidTo) throw new Error(`No account mapped for "${mopName}" under company "${location.erpnextCompany}"`);

  const dateStr = toDateStr(completedAt);
  const pe = await erpnextPost<{ name: string }>(cfg, "/api/resource/Payment Entry", {
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

  console.log(`[ERPNext] Delivery PE ${pe.name} created for Sales Invoice ${invoice.name} (${mopName})`);
}

export async function cancelErpnextSalesInvoice(
  orderName: string,
  location: LocationWithErpInstance,
): Promise<void> {
  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) return;
  if (!location.erpnextCompany) return;

  const filters = encodeURIComponent(
    JSON.stringify([
      ["po_no", "=", orderName],
      ["company", "=", location.erpnextCompany],
      ["docstatus", "=", "1"],
    ]),
  );
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const list = await erpnextGet<Array<{ name: string }>>(
    cfg,
    `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`,
  );

  if (!list || list.length === 0) {
    console.warn(`[ERPNext] No submitted Sales Invoice found for po_no="${orderName}" — skipping cancel`);
    return;
  }

  const invoiceName = list[0].name;
  const res = await fetch(`${cfg.baseUrl}/api/method/frappe.client.cancel`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ doctype: "Sales Invoice", name: invoiceName }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERPNext cancel Sales Invoice ${invoiceName} [${res.status}]: ${text.slice(0, 500)}`);
  }

  console.log(`[ERPNext] Cancelled Sales Invoice ${invoiceName} for Shopify order ${orderName}`);
}

export async function syncBankTransferPaymentToERPNext(
  orderPoNo: string,
  location: LocationWithErpInstance,
  dateStr: string,
): Promise<void> {
  const cfg = getErpConfig(location.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    console.log("[ERPNext] syncBankTransferPaymentToERPNext: skipping — credentials not configured");
    return;
  }
  if (!location.erpnextCompany || !location.erpnextWarehouse) {
    console.log(`[ERPNext] syncBankTransferPaymentToERPNext: skipping — location missing erpnextCompany or erpnextWarehouse`);
    return;
  }
  console.log(`[ERPNext] syncBankTransferPaymentToERPNext called for po_no="${orderPoNo}" company="${location.erpnextCompany}"`);

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
  >(cfg, `/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`);

  if (!list || list.length === 0) {
    console.warn(`[ERPNext] No Sales Invoice found for po_no="${orderPoNo}" — skipping bank transfer payment entry`);
    return;
  }

  const invoice = list[0];
  if (invoice.outstanding_amount <= 0) {
    console.log(`[ERPNext] Sales Invoice ${invoice.name} already fully paid — skipping`);
    return;
  }

  const mop = await erpnextGet<{
    name: string;
    accounts: Array<{ company: string; default_account: string }>;
  }>(cfg, `/api/resource/Mode%20of%20Payment/${encodeURIComponent(cfg.bankTransferMop)}`);

  if (!mop) {
    throw new Error(`ERPNext Mode of Payment "${cfg.bankTransferMop}" not found`);
  }

  const paidTo = mop.accounts.find((a) => a.company === location.erpnextCompany)?.default_account;
  if (!paidTo) {
    throw new Error(`No account mapped for "${cfg.bankTransferMop}" under company "${location.erpnextCompany}"`);
  }

  const pe = await erpnextPost<{ name: string }>(cfg, "/api/resource/Payment Entry", {
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
  location: LocationWithErpInstance,
  shopifyData: ShopifyOrderWebhookPayload,
): Promise<void> {
  const cfg = getErpConfig(location.erpnextInstance);
  console.log(`[ERPNext] syncOrderToERPNext called — company=${location.erpnextCompany ?? "null"}, warehouse=${location.erpnextWarehouse ?? "null"}, baseUrl=${cfg.baseUrl ? "set" : "missing"}`);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    console.warn("[ERPNext] Skipping sync — ERP credentials not configured");
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

  await ensureCustomer(cfg, customerName, customerEmail, customerPhone, location.erpnextCompany);

  const dateStr = toDateStr(order.createdAt);

  const siItems = lineItems.map((li) => ({
    item_code: li.sku ?? String(li.variant_id ?? li.id),
    item_name: li.title ?? undefined,
    qty: li.quantity,
    rate: parseFloat(li.price),
    warehouse: location.erpnextWarehouse,
  }));

  const shopifyShippingAmt = (shopifyData.shipping_lines ?? []).reduce(
    (sum, line) => sum + parseFloat(line.price ?? "0"), 0,
  );
  if (shopifyShippingAmt > 0 && cfg.shippingItem) {
    siItems.push({
      item_code: cfg.shippingItem,
      item_name: "Delivery Charges",
      qty: 1,
      rate: shopifyShippingAmt,
      warehouse: location.erpnextWarehouse,
    });
  }

  const itemsTotal = siItems.reduce((sum, li) => sum + li.rate * li.qty, 0);
  const vaultTotal = parseFloat(order.totalPrice.toString());
  const discountAmt = parseFloat((itemsTotal - vaultTotal).toFixed(2));

  const siBody = {
    doctype: "Sales Invoice",
    company: location.erpnextCompany,
    customer: customerName,
    posting_date: dateStr,
    po_no: (order.name ?? order.shopifyOrderId).slice(0, 140),
    update_stock: 1,
    set_warehouse: location.erpnextWarehouse,
    docstatus: 1,
    items: siItems,
    ...(cfg.shippingRule ? { shipping_rule: cfg.shippingRule } : {}),
    ...(cfg.taxesAndCharges ? { taxes_and_charges: cfg.taxesAndCharges } : { taxes: [] }),
    ...(discountAmt > 0 ? { discount_amount: discountAmt, apply_discount_on: "Net Total" } : {}),
  };

  let si: { name: string; debit_to: string; grand_total: number };
  try {
    si = await erpnextPost<{ name: string; debit_to: string; grand_total: number }>(cfg, "/api/resource/Sales Invoice", siBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("417") || msg.includes("Debit and Credit not equal")) {
      console.warn("[ERPNext] SI creation failed — retrying without taxes:", msg.slice(0, 200));
      const { taxes_and_charges: _t, taxes: _tx, ...siBodyClean } = siBody as Record<string, unknown>;
      si = await erpnextPost<{ name: string; debit_to: string; grand_total: number }>(cfg, "/api/resource/Sales Invoice", { ...siBodyClean, taxes: [] });
    } else {
      throw err;
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { erpnextInvoiceId: si.name },
  });

  console.log(`[ERPNext] Synced Shopify order ${order.shopifyOrderId} → Sales Invoice ${si.name}`);

  const gateways = (shopifyData.payment_gateway_names ?? []).map((g) => g.toLowerCase().trim());

  if (gateways.some((g) => g.includes("koko"))) {
    await createPrepaidPaymentEntry(cfg, si.name, location.erpnextCompany, customerName, si.debit_to, si.grand_total, dateStr, cfg.kokoMop);
  } else if (cfg.webxpayMop && gateways.some((g) => g.includes("webxpay"))) {
    await createPrepaidPaymentEntry(cfg, si.name, location.erpnextCompany, customerName, si.debit_to, si.grand_total, dateStr, cfg.webxpayMop);
  }
}
