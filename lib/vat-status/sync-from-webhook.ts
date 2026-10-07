import "server-only";

import { prisma } from "@/lib/prisma";
import { fetchErpItemTaxHits } from "@/lib/osf/erp-tax-status";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import {
  slotForInstance,
  webhookItemCode,
} from "@/lib/vat-status/apply-tax-status";
import { pickErpTaxHit } from "@/lib/vat-status/types";

export async function findErpInstancesForWebhookSecret(secret: string) {
  if (!secret) return [];
  const matched = await prisma.erpnextInstance.findMany({
    where: { incomingWebhookSecret: secret },
    select: { id: true },
  });
  if (matched.length > 0) return matched;

  const envSecret = process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
  if (!envSecret || secret !== envSecret) return [];
  return prisma.erpnextInstance.findMany({
    where: { OR: [{ incomingWebhookSecret: null }, { incomingWebhookSecret: "" }] },
    select: { id: true },
  });
}

export async function syncItemTaxStatusFromWebhook(input: {
  instanceIds: string[];
  payload: Record<string, unknown>;
}): Promise<{ itemCode: string; updated: number } | { skipped: string }> {
  const itemCode = webhookItemCode(input.payload);
  if (!itemCode) return { skipped: "missing_item_code" };
  if (input.instanceIds.length === 0) return { skipped: "no_instance" };

  const instances = await prisma.erpnextInstance.findMany({
    where: { id: { in: input.instanceIds } },
    select: { id: true, companyId: true },
  });

  let updated = 0;
  const byCompany = new Map<string, string[]>();
  for (const instance of instances) {
    const list = byCompany.get(instance.companyId) ?? [];
    list.push(instance.id);
    byCompany.set(instance.companyId, list);
  }

  for (const [companyId, ids] of byCompany) {
    const all = await getAllOsfErpInstances(companyId);
    const slots = resolveErpSlots(all);
    for (const id of ids) {
      const slot = slotForInstance(id, slots);
      const instance = all.find((row) => row.id === id);
      if (!slot || !instance) continue;
      const hits = await fetchErpItemTaxHits(instance.cfg, [itemCode]);
      const hit = pickErpTaxHit(hits, itemCode);
      const taxStatus = hit?.taxStatus ?? null;
      const result = await prisma.productItem.updateMany({
        where: {
          companyId,
          sku: { equals: itemCode, mode: "insensitive" },
        },
        data:
          slot === "erp1"
            ? { erp1TaxStatus: taxStatus }
            : { erp2TaxStatus: taxStatus },
      });
      updated += result.count;
    }
  }

  return { itemCode, updated };
}
