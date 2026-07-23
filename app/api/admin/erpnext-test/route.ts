import { NextResponse } from "next/server";

import { formatAppIsoDate } from "@/lib/format-datetime";

const BASE_URL = (process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
const API_KEY = process.env.ERPNEXT_API_KEY ?? "";
const API_SECRET = process.env.ERPNEXT_API_SECRET ?? "";

const TEST_COMPANY = "Supplement Vault.lk";
const TEST_WAREHOUSE = "Main Warehouse - SV1";
const TEST_ITEM_CODE = "BM001-1";
const TEST_CUSTOMER_NAME = "Test Shopify Customer";

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${API_KEY}:${API_SECRET}`,
  };
}

function toDateStr(d: Date) {
  return formatAppIsoDate(d);
}

export async function POST(req: Request) {
  if (!BASE_URL || !API_KEY || !API_SECRET) {
    return NextResponse.json(
      { ok: false, error: "ERPNEXT_BASE_URL / API_KEY / API_SECRET not set in .env" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({})) as {
    customer_name?: string;
    item_code?: string;
    qty?: number;
    rate?: number;
    koko?: boolean;
    bank_transfer?: boolean;
    po_no?: string;
  };

  const customerName = body.customer_name || TEST_CUSTOMER_NAME;
  const itemCode = body.item_code || TEST_ITEM_CODE;
  const qty = body.qty ?? 1;
  const rate = body.rate ?? 100;
  const testKoko = body.koko === true;
  const testBankTransfer = body.bank_transfer === true;

  // Bank transfer only mode: find existing invoice by po_no and create payment entry
  if (testBankTransfer && body.po_no) {
    const steps: Record<string, unknown> = {};
    const dateStr = toDateStr(new Date());
    const mopName = process.env.ERPNEXT_BANK_TRANSFER_MOP ?? "Wire Transfer";

    try {
      const filters = encodeURIComponent(JSON.stringify([
        ["po_no", "=", body.po_no],
        ["company", "=", TEST_COMPANY],
        ["docstatus", "=", "1"],
      ]));
      const fields = encodeURIComponent(JSON.stringify(["name", "outstanding_amount", "debit_to", "customer"]));
      const siRes = await fetch(
        `${BASE_URL}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=1`,
        { headers: authHeaders() },
      );
      const siJson = (await siRes.json()) as {
        data?: Array<{ name: string; outstanding_amount: number; debit_to: string; customer: string }>;
      };
      steps.findInvoice = { status: siRes.status, po_no: body.po_no, body: siJson };

      if (!siRes.ok || !siJson.data?.length) {
        return NextResponse.json({ ok: false, step: "findInvoice", error: "No submitted Sales Invoice found for this po_no", steps });
      }

      const invoice = siJson.data[0];
      if (invoice.outstanding_amount <= 0) {
        return NextResponse.json({ ok: false, step: "findInvoice", error: `Invoice ${invoice.name} is already fully paid`, steps });
      }

      const mopRes = await fetch(
        `${BASE_URL}/api/resource/Mode%20of%20Payment/${encodeURIComponent(mopName)}`,
        { headers: authHeaders() },
      );
      const mopJson = (await mopRes.json()) as {
        data?: { name?: string; accounts?: Array<{ company: string; default_account: string }> };
      };
      steps.modeOfPayment = { status: mopRes.status, body: mopJson };
      if (!mopRes.ok) {
        return NextResponse.json({ ok: false, step: "modeOfPayment", steps });
      }

      const paidTo = mopJson.data?.accounts?.find((a) => a.company === TEST_COMPANY)?.default_account;
      if (!paidTo) {
        return NextResponse.json({ ok: false, step: "modeOfPayment", error: `No account mapped for "${mopName}" under "${TEST_COMPANY}"`, steps });
      }

      const peRes = await fetch(`${BASE_URL}/api/resource/Payment Entry`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          doctype: "Payment Entry",
          payment_type: "Receive",
          company: TEST_COMPANY,
          posting_date: dateStr,
          mode_of_payment: mopJson.data?.name ?? mopName,
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
          references: [{ reference_doctype: "Sales Invoice", reference_name: invoice.name, allocated_amount: invoice.outstanding_amount }],
          docstatus: 1,
        }),
      });
      const peJson = await peRes.json();
      steps.paymentEntry = { status: peRes.status, body: peJson };
      if (!peRes.ok) {
        return NextResponse.json({ ok: false, step: "paymentEntry", steps });
      }

      return NextResponse.json({ ok: true, message: `Invoice ${invoice.name} marked paid via ${mopName}`, steps });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e), steps });
    }
  }

  const steps: Record<string, unknown> = {};
  const dateStr = toDateStr(new Date());

  // Step 1: ensure customer exists
  try {
    const existing = await fetch(
      `${BASE_URL}/api/resource/Customer/${encodeURIComponent(customerName)}`,
      { headers: authHeaders() },
    );
    if (existing.status === 404) {
      const created = await fetch(`${BASE_URL}/api/resource/Customer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          doctype: "Customer",
          customer_name: customerName,
          customer_type: "Individual",
          customer_group: "Individual",
          territory: "All Territories",
          default_company: TEST_COMPANY,
        }),
      });
      const json = await created.json();
      steps.customer = { action: "created", status: created.status, body: json };
    } else {
      steps.customer = { action: "already_exists", status: existing.status };
    }
  } catch (e) {
    return NextResponse.json({ ok: false, step: "customer", error: String(e) });
  }

  // Step 2: create Sales Invoice with update_stock
  try {
    const res = await fetch(`${BASE_URL}/api/resource/Sales Invoice`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        doctype: "Sales Invoice",
        company: TEST_COMPANY,
        customer: customerName,
        posting_date: dateStr,
        po_no: `TEST-SHOPIFY-${Date.now()}`,
        update_stock: 1,
        set_warehouse: TEST_WAREHOUSE,
        docstatus: 1,
        items: [
          {
            item_code: itemCode,
            qty,
            rate,
            warehouse: TEST_WAREHOUSE,
          },
        ],
      }),
    });
    const json = (await res.json()) as { data?: { name: string; debit_to?: string; grand_total?: number } };
    steps.salesInvoice = { status: res.status, body: json };
    if (!res.ok || !json.data?.name) {
      return NextResponse.json({ ok: false, step: "salesInvoice", steps });
    }

    // Step 3 (optional): create Bank Transfer Payment Entry (simulates COD → Bank Transfer)
    if (testBankTransfer) {
      const invoiceName = json.data.name;
      const debitTo = json.data.debit_to ?? "Debtors - SV1";
      const totalAmount = json.data.grand_total ?? qty * rate;
      const mopName = process.env.ERPNEXT_BANK_TRANSFER_MOP ?? "Wire Transfer";
      try {
        const mopRes = await fetch(
          `${BASE_URL}/api/resource/Mode%20of%20Payment/${encodeURIComponent(mopName)}`,
          { headers: authHeaders() },
        );
        const mopJson = (await mopRes.json()) as {
          data?: { name?: string; accounts?: Array<{ company: string; default_account: string }> };
        };
        steps.bankTransferModeOfPayment = { status: mopRes.status, body: mopJson };
        if (!mopRes.ok) {
          return NextResponse.json({ ok: false, step: "bankTransferModeOfPayment", steps });
        }

        const paidTo = mopJson.data?.accounts?.find((a) => a.company === TEST_COMPANY)?.default_account;
        if (!paidTo) {
          return NextResponse.json({
            ok: false,
            step: "bankTransferModeOfPayment",
            error: `No account mapped for "${mopName}" under company "${TEST_COMPANY}"`,
            steps,
          });
        }

        const peRes = await fetch(`${BASE_URL}/api/resource/Payment Entry`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            doctype: "Payment Entry",
            payment_type: "Receive",
            company: TEST_COMPANY,
            posting_date: dateStr,
            mode_of_payment: mopJson.data?.name ?? mopName,
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
          }),
        });
        const peJson = await peRes.json();
        steps.bankTransferPaymentEntry = { status: peRes.status, body: peJson };
        if (!peRes.ok) {
          return NextResponse.json({ ok: false, step: "bankTransferPaymentEntry", steps });
        }
      } catch (e) {
        return NextResponse.json({ ok: false, step: "bankTransferPaymentEntry", error: String(e), steps });
      }
    }

    // Step 4 (optional): create Koko Payment Entry
    if (testKoko) {
      const invoiceName = json.data.name;
      const debitTo = json.data.debit_to ?? "Debtors - SV1";
      const totalAmount = json.data.grand_total ?? qty * rate;
      try {
        // Fetch the Koko account from Mode of Payment
        const mopRes = await fetch(
          `${BASE_URL}/api/resource/Mode%20of%20Payment/Koko`,
          { headers: authHeaders() },
        );
        const mopJson = (await mopRes.json()) as {
          data?: { accounts?: Array<{ company: string; default_account: string }> };
        };
        steps.kokoModeOfPayment = { status: mopRes.status, body: mopJson };
        if (!mopRes.ok) {
          return NextResponse.json({ ok: false, step: "kokoModeOfPayment", steps });
        }

        const kokoAccount = mopJson.data?.accounts?.find(
          (a) => a.company === TEST_COMPANY,
        )?.default_account;
        if (!kokoAccount) {
          return NextResponse.json({
            ok: false,
            step: "kokoModeOfPayment",
            error: `No account mapped for Koko under company "${TEST_COMPANY}"`,
            steps,
          });
        }

        const peRes = await fetch(`${BASE_URL}/api/resource/Payment Entry`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            doctype: "Payment Entry",
            payment_type: "Receive",
            company: TEST_COMPANY,
            posting_date: dateStr,
            mode_of_payment: "Koko",
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
          }),
        });
        const peJson = await peRes.json();
        steps.paymentEntry = { status: peRes.status, body: peJson };
        if (!peRes.ok) {
          return NextResponse.json({ ok: false, step: "paymentEntry", steps });
        }
      } catch (e) {
        return NextResponse.json({ ok: false, step: "paymentEntry", error: String(e), steps });
      }
    }
  } catch (e) {
    return NextResponse.json({ ok: false, step: "salesInvoice", error: String(e) });
  }

  return NextResponse.json({ ok: true, message: "Full sync test passed", steps });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const check = url.searchParams.get("check");

  if (check === "items") {
    if (!BASE_URL || !API_KEY || !API_SECRET) {
      return NextResponse.json({ ok: false, error: "ERPNEXT_BASE_URL / API_KEY / API_SECRET not set" }, { status: 500 });
    }
    const fields = encodeURIComponent(JSON.stringify(["item_code", "item_name", "stock_uom"]));
    const filters = encodeURIComponent(JSON.stringify([["disabled", "=", "0"]]));
    const binFields = encodeURIComponent(JSON.stringify(["item_code", "actual_qty", "reserved_qty", "warehouse"]));
    const binFilters = encodeURIComponent(JSON.stringify([
      ["warehouse", "=", TEST_WAREHOUSE],
      ["actual_qty", ">", "0"],
    ]));

    try {
      const [itemsRes, binRes] = await Promise.all([
        fetch(`${BASE_URL}/api/resource/Item?filters=${filters}&fields=${fields}&limit=200`, { headers: authHeaders() }),
        fetch(`${BASE_URL}/api/resource/Bin?filters=${binFilters}&fields=${binFields}&limit=200`, { headers: authHeaders() }),
      ]);

      const itemsJson = (await itemsRes.json()) as { data?: Array<{ item_code: string; item_name: string; stock_uom: string }> };
      const binJson = (await binRes.json()) as { data?: Array<{ item_code: string; actual_qty: number; reserved_qty: number; warehouse: string }> };

      if (!itemsRes.ok) {
        return NextResponse.json({ ok: false, error: `ERPNext items fetch failed: ${itemsRes.status}`, body: itemsJson });
      }

      const stockMap = new Map(
        (binJson.data ?? []).map((b) => [b.item_code, { actual_qty: b.actual_qty, reserved_qty: b.reserved_qty }])
      );

      const items = (itemsJson.data ?? [])
        .map((item) => ({
          item_code: item.item_code,
          item_name: item.item_name,
          stock_uom: item.stock_uom,
          actual_qty: stockMap.get(item.item_code)?.actual_qty ?? 0,
          reserved_qty: stockMap.get(item.item_code)?.reserved_qty ?? 0,
          in_stock: (stockMap.get(item.item_code)?.actual_qty ?? 0) > 0,
        }))
        .sort((a, b) => b.actual_qty - a.actual_qty);

      return NextResponse.json({ ok: true, warehouse: TEST_WAREHOUSE, total: items.length, items });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({
    info: "Send a POST request to this endpoint to run the full ERPNext sync test",
    test_company: TEST_COMPANY,
    test_warehouse: TEST_WAREHOUSE,
    test_item: TEST_ITEM_CODE,
    test_customer: TEST_CUSTOMER_NAME,
    tips: { check_items: "GET ?check=items — lists all items with stock levels from the test warehouse" },
  });
}
