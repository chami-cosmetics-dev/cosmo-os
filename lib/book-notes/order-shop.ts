import { Prisma } from "@prisma/client";

import { shopLabelForLocation } from "@/lib/book-notes/serialize";
import {
  isCosmeticsBookNoteLocation,
  orderMatchesCosmeticsPosScope,
  type BookNoteCosmeticsPosScope,
} from "@/lib/book-notes/shop-outlet-map";
import { prisma } from "@/lib/prisma";

export type BookNoteOrderShopHit = {
  id: string;
  companyLocationId: string;
  shopLabel: string;
  posProfile: string | null;
  erpnextWarehouse: string | null;
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

export function foreignShopRowError(input: {
  idxNo: string;
  salesInvoice: string;
  shopLabel: string;
}): string {
  const row = input.idxNo.trim() ? `Row ${input.idxNo}` : "This row";
  const invoice = input.salesInvoice.trim() || "this invoice";
  return `${row}: ${invoice} belongs to ${input.shopLabel}. Add only this outlet's orders.`;
}

/**
 * Rejects a ledger row whose orderId / invoice belongs to another Cosmo shop
 * or (on Cosmetics.lk) another POS floor.
 */
export function findForeignShopRow(input: {
  selectedLocationId: string;
  selectedIsCosmetics: boolean;
  cosmeticsPosScope: BookNoteCosmeticsPosScope | null;
  rows: Array<{ idxNo: string; salesInvoice: string; orderId?: string | null }>;
  hits: BookNoteOrderShopHit[];
}): { error: string } | null {
  const byId = new Map(input.hits.map((h) => [h.id, h]));

  for (const row of input.rows) {
    const matches = row.orderId
      ? (() => {
          const hit = byId.get(row.orderId!);
          return hit ? [hit] : [];
        })()
      : input.hits.filter((h) => orderMatchesInvoice(h.keys, row.salesInvoice));

    if (matches.length === 0) continue;

    const ownShop = matches.filter(
      (h) => h.companyLocationId === input.selectedLocationId,
    );
    if (ownShop.length === 0) {
      return {
        error: foreignShopRowError({
          idxNo: row.idxNo,
          salesInvoice: row.salesInvoice,
          shopLabel: matches[0]?.shopLabel ?? "another outlet",
        }),
      };
    }

    if (input.selectedIsCosmetics && input.cosmeticsPosScope) {
      const inPos = ownShop.filter((h) =>
        orderMatchesCosmeticsPosScope({
          posProfile: h.posProfile,
          erpnextWarehouse: h.erpnextWarehouse,
          scope: input.cosmeticsPosScope!,
        }),
      );
      if (inPos.length === 0) {
        const label =
          ownShop[0]?.posProfile ||
          ownShop[0]?.erpnextWarehouse ||
          "another Cosmetics POS";
        return {
          error: foreignShopRowError({
            idxNo: row.idxNo,
            salesInvoice: row.salesInvoice,
            shopLabel: label,
          }),
        };
      }
    }
  }

  return null;
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
      posProfile: true,
      erpnextWarehouse: true,
      companyLocation: { select: { name: true, shortName: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    companyLocationId: order.companyLocationId,
    shopLabel: shopLabelForLocation(order.companyLocation),
    posProfile: order.posProfile,
    erpnextWarehouse: order.erpnextWarehouse,
    keys: invoiceKeys(order),
  }));
}

export function locationNeedsCosmeticsPosFilter(location: {
  erpnextCompany?: string | null;
  name?: string | null;
  shortName?: string | null;
}): boolean {
  return isCosmeticsBookNoteLocation(location);
}
