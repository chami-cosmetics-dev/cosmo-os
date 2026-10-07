import "server-only";

import { prisma } from "@/lib/prisma";
import { fetchErpItemTaxHits } from "@/lib/osf/erp-tax-status";
import { getAllOsfErpInstances, type OsfErpInstance } from "@/lib/osf/erp-stock";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import {
  buildVatStatusSlot,
  pickErpTaxHit,
  type VatStatusLookup,
  type VatStatusSlotId,
} from "@/lib/vat-status/types";

async function readSlot(
  id: VatStatusSlotId,
  instance: OsfErpInstance | null,
  fallbackLabel: string,
  itemCodes: string[],
  sku: string,
) {
  const label = (instance?.label ?? "").trim() || fallbackLabel;
  if (!instance) {
    return buildVatStatusSlot({ id, label, configured: false });
  }
  try {
    const hits = await fetchErpItemTaxHits(instance.cfg, itemCodes);
    return buildVatStatusSlot({
      id,
      label,
      configured: true,
      hit: pickErpTaxHit(hits, sku),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP fetch failed";
    return buildVatStatusSlot({
      id,
      label,
      configured: true,
      error: message.slice(0, 300),
    });
  }
}

export async function lookupSkuVatStatus(
  companyId: string,
  sku: string,
): Promise<VatStatusLookup> {
  const typed = sku.trim();
  const local = await prisma.productItem.findFirst({
    where: {
      companyId,
      sku: { equals: typed, mode: "insensitive" },
    },
    select: { sku: true },
  });
  const itemCodes = [...new Set([typed, local?.sku?.trim()].filter((code): code is string => Boolean(code)))];

  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const erp1 = slots.erp1 ? (instances.find((row) => row.id === slots.erp1!.id) ?? null) : null;
  const erp2 = slots.erp2 ? (instances.find((row) => row.id === slots.erp2!.id) ?? null) : null;

  const [erp1Slot, erp2Slot] = await Promise.all([
    readSlot("erp1", erp1, "ERP1", itemCodes, typed),
    readSlot("erp2", erp2, "ERP2", itemCodes, typed),
  ]);

  return { sku: typed, erp1: erp1Slot, erp2: erp2Slot };
}
