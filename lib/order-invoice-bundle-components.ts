import { unwrapErpWebhookPayload, type ErpApiCreds } from "@/lib/erpnext-customer-display-name";

type ErpRow = { name?: string; item_code?: string; item_name?: string; parent_detail_docname?: string; parent_item?: string };
export type InvoiceBundleComponent = { sku: string; description: string };

async function erpGet<T>(creds: ErpApiCreds, path: string): Promise<T | null> {
  try {
    const response = await fetch(`${creds.baseUrl}${path}`, {
      headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: T };
    return body.data ?? null;
  } catch {
    return null;
  }
}

function rows(value: unknown): ErpRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is ErpRow => Boolean(row && typeof row === "object"))
    : [];
}

export async function resolveOrderInvoiceBundleComponents(input: {
  rawPayload: unknown;
  invoiceName?: string | null;
  erpnextInvoiceId?: string | null;
  creds: ErpApiCreds | null;
  skus: Array<string | null>;
}): Promise<InvoiceBundleComponent[][]> {
  const payload = unwrapErpWebhookPayload(input.rawPayload);
  const invoiceRef = input.erpnextInvoiceId?.trim() ||
    (typeof payload?.name === "string" ? payload.name.trim() : "") || input.invoiceName?.trim();
  const invoice = input.creds && invoiceRef
    ? await erpGet<{ items?: ErpRow[]; packed_items?: ErpRow[] }>(
        input.creds, `/api/resource/Sales Invoice/${encodeURIComponent(invoiceRef)}`,
      )
    : null;
  const invoiceItems = rows(invoice?.items ?? payload?.items);
  const packed = rows(invoice?.packed_items ?? payload?.packed_items);
  const definitions = new Map<string, Promise<ErpRow[]>>();
  const names = new Map<string, Promise<string>>();
  const describe = (row: ErpRow) => {
    const sku = row.item_code!;
    if (row.item_name || !input.creds) return Promise.resolve({ sku, description: row.item_name || sku });
    if (!names.has(sku)) {
      names.set(sku, erpGet<{ item_name?: string }>(
        input.creds, `/api/resource/Item/${encodeURIComponent(sku)}`,
      ).then((item) => item?.item_name || sku));
    }
    return names.get(sku)!.then((description) => ({ sku, description }));
  };

  return Promise.all(input.skus.map(async (sku, index) => {
    if (!sku) return [];
    const parent = invoiceItems[index]?.item_code === sku
      ? invoiceItems[index]
      : invoiceItems.find((row) => row.item_code === sku);
    const matched = packed.filter((row) =>
      parent?.name ? row.parent_detail_docname === parent.name : row.parent_item === sku,
    );
    const fallback = matched.length ? matched : packed.filter((row) => row.parent_item === sku);
    if (fallback.length) {
      return Promise.all(fallback.filter((row) => row.item_code).map(describe));
    }
    if (!input.creds) return [];
    if (!definitions.has(sku)) {
      definitions.set(sku, (async () => {
        const filters = encodeURIComponent(JSON.stringify([["new_item_code", "=", sku]]));
        const bundles = await erpGet<Array<{ name: string }>>(
          input.creds!, `/api/resource/Product Bundle?filters=${filters}&fields=${encodeURIComponent('["name"]')}&limit_page_length=1`,
        );
        const bundle = bundles?.[0]?.name
          ? await erpGet<{ items?: ErpRow[] }>(input.creds!, `/api/resource/Product Bundle/${encodeURIComponent(bundles[0].name)}`)
          : null;
        return rows(bundle?.items);
      })());
    }
    return Promise.all((await definitions.get(sku)!).filter((row) => row.item_code).map(describe));
  }));
}
