import { Prisma } from "@prisma/client";

import { shopLabelForLocation } from "@/lib/book-notes/serialize";
import { prisma } from "@/lib/prisma";

export type BookNoteOrderShopHit = {
  id: string;
  companyLocationId: string;
  shopLabel: string;
  keys: string[];
};

function invoiceKeys(order: {
  erpnextInvoiceId?: string | null;
  name?: string | null;
  orderNumber?: string | null;
}): string[] {
  return [order.erpnextInvoiceId, order.name, order.orderNumber]
    .map((v) => (v ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function orderMatchesInvoice(
  keys: string[],
  salesInvoice: string,
): boolean {
  const needle = salesInvoice.trim().toLowerCase();
  if (!needle) return false;
  return keys.includes(needle);
}

/**
 * When an invoice is already in OS at another outlet, the selected shop must
 * not save it. Unknown invoices (no OS order) stay allowed.
 */
export function foreignShopForInvoice(input: {
  salesInvoice: string;
  selectedLocationId: string;
  hits: BookNoteOrderShopHit[];
}): BookNoteOrderShopHit | null {
  const matches = input.hits.filter((h) =>
    orderMatchesInvoice(h.keys, input.salesInvoice),
  );
  if (matches.length === 0) return null;
  if (matches.some((h) => h.companyLocationId === input.selectedLocationId)) {
    return null;
  }
  return matches[0] ?? null;
}

export function foreignShopRowError(input: {
  idxNo: string;
  salesInvoice: string;
  shopLabel: string;
}): string {
  const row = input.idxNo.trim() ? `Row ${input.idxNo}` : "This row";
  const invoice = input.salesInvoice.trim() || "this invoice";
  return `${row}: ${invoice} belongs to ${input.shopLabel}. Add only this outlet's orders.`;
}

export async function loadBookNoteOrderShopHits(input: {
  companyId: string;
  orderIds: string[];
  invoices: string[];
}): Promise<BookNoteOrderShopHit[]> {
  const orderIds = [...new Set(input.orderIds.filter(Boolean))];
  const invoices = uniqueTrimmed(input.invoices);
  if (orderIds.length === 0 && invoices.length === 0) return [];

  const or: Prisma.OrderWhereInput[] = [];
  if (orderIds.length > 0) or.push({ id: { in: orderIds } });
  if (invoices.length > 0) {
    or.push({ erpnextInvoiceId: { in: invoices, mode: "insensitive" } });
    or.push({ name: { in: invoices, mode: "insensitive" } });
    or.push({ orderNumber: { in: invoices, mode: "insensitive" } });
  }

  const orders = await prisma.order.findMany({
    where: { companyId: input.companyId, OR: or },
    select: {
      id: true,
      companyLocationId: true,
      erpnextInvoiceId: true,
      name: true,
      orderNumber: true,
      companyLocation: { select: { name: true, shortName: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    companyLocationId: order.companyLocationId,
    shopLabel: shopLabelForLocation(order.companyLocation),
    keys: invoiceKeys(order),
  }));
}

/**
 * Rejects a ledger row whose orderId or invoice number belongs to another
 * outlet. Manual invoices with no OS match pass.
 */
export function findForeignShopRow(input: {
  selectedLocationId: string;
  rows: Array<{ idxNo: string; salesInvoice: string; orderId?: string | null }>;
  hits: BookNoteOrderShopHit[];
}): { error: string } | null {
  const byId = new Map(input.hits.map((h) => [h.id, h]));

  for (const row of input.rows) {
    if (row.orderId) {
      const hit = byId.get(row.orderId);
      if (!hit || hit.companyLocationId !== input.selectedLocationId) {
        return {
          error: foreignShopRowError({
            idxNo: row.idxNo,
            salesInvoice: row.salesInvoice,
            shopLabel: hit?.shopLabel ?? "another outlet",
          }),
        };
      }
      continue;
    }

    const foreign = foreignShopForInvoice({
      salesInvoice: row.salesInvoice,
      selectedLocationId: input.selectedLocationId,
      hits: input.hits,
    });
    if (foreign) {
      return {
        error: foreignShopRowError({
          idxNo: row.idxNo,
          salesInvoice: row.salesInvoice,
          shopLabel: foreign.shopLabel,
        }),
      };
    }
  }

  return null;
}
