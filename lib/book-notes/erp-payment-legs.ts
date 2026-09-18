import type { BookNoteOrderPaymentEntryInput } from "@/lib/book-notes/payment-columns";

type ErpListCredentials = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

type PaymentLedgerRow = {
  voucher_no?: unknown;
  against_voucher_no?: unknown;
  amount?: unknown;
};

type PaymentEntryRow = {
  name?: unknown;
  mode_of_payment?: unknown;
  payment_type?: unknown;
  docstatus?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asAbsAmount(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.round(Math.abs(n) * 100) / 100;
}

export function groupErpPaymentLegs(
  refs: Array<{
    parent?: unknown;
    reference_name?: unknown;
    allocated_amount?: unknown;
  }>,
  entries: PaymentEntryRow[],
): Map<string, BookNoteOrderPaymentEntryInput[]> {
  const byName = new Map<string, PaymentEntryRow>();
  for (const pe of entries) {
    const name = asString(pe.name);
    if (!name) continue;
    if (Number(pe.docstatus) !== 1) continue;
    if (asString(pe.payment_type).toLowerCase() === "pay") continue;
    byName.set(name, pe);
  }

  const grouped = new Map<string, BookNoteOrderPaymentEntryInput[]>();
  for (const ref of refs) {
    const invoice = asString(ref.reference_name);
    const parent = asString(ref.parent);
    const amount = asAbsAmount(ref.allocated_amount);
    if (!invoice || !parent || amount <= 0) continue;
    const pe = byName.get(parent);
    if (!pe) continue;
    const legs = grouped.get(invoice) ?? [];
    legs.push({
      paymentType: asString(pe.payment_type) || "Receive",
      modeOfPayment: asString(pe.mode_of_payment),
      allocatedAmount: amount,
    });
    grouped.set(invoice, legs);
  }
  return grouped;
}

async function erpGetList<T>(
  creds: ErpListCredentials,
  args: {
    doctype: string;
    filters: unknown;
    fields: string[];
    limit: number;
  },
): Promise<T[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${creds.baseUrl}/api/method/frappe.client.get_list`, {
      method: "POST",
      headers: {
        Authorization: `token ${creds.apiKey}:${creds.apiSecret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        doctype: args.doctype,
        filters: args.filters,
        fields: args.fields,
        limit_page_length: args.limit,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { message?: unknown };
    return Array.isArray(json.message) ? (json.message as T[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Live ERP Payment Entry legs keyed by sales invoice. Soft-fails to empty. */
export async function fetchErpPaymentLegsByInvoice(input: {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  invoiceNames: string[];
}): Promise<Map<string, BookNoteOrderPaymentEntryInput[]>> {
  const invoiceNames = [
    ...new Set(input.invoiceNames.map((n) => n.trim()).filter(Boolean)),
  ];
  if (invoiceNames.length === 0) return new Map();
  if (!input.baseUrl || !input.apiKey || !input.apiSecret) return new Map();

  const creds = {
    baseUrl: input.baseUrl.replace(/\/$/, ""),
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
  };

  const refs = await erpGetList<PaymentLedgerRow>(creds, {
    doctype: "Payment Ledger Entry",
    filters: [
      ["voucher_type", "=", "Payment Entry"],
      ["against_voucher_type", "=", "Sales Invoice"],
      ["against_voucher_no", "in", invoiceNames],
    ],
    fields: ["voucher_no", "against_voucher_no", "amount"],
    limit: 200,
  });
  if (refs.length === 0) return new Map();

  const parentNames = [
    ...new Set(refs.map((r) => asString(r.voucher_no)).filter(Boolean)),
  ];
  if (parentNames.length === 0) return new Map();

  const entries = await erpGetList<PaymentEntryRow>(creds, {
    doctype: "Payment Entry",
    filters: [
      ["name", "in", parentNames],
      ["docstatus", "=", 1],
    ],
    fields: ["name", "mode_of_payment", "payment_type", "docstatus"],
    limit: 100,
  });

  return groupErpPaymentLegs(
    refs.map((row) => ({
      parent: row.voucher_no,
      reference_name: row.against_voucher_no,
      allocated_amount: asAbsAmount(row.amount),
    })),
    entries,
  );
}
