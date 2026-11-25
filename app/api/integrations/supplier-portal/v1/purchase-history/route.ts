import { prisma } from "@/lib/prisma";
import { createPurchaseHistoryHandler } from "@/lib/purchase-history/lookup";
import { fetchPurchaseHistory, verifyExactErpItem } from "@/lib/osf/purchase-history";

export const GET = createPurchaseHistoryHandler({
  config: () => process.env.SUPPLIER_PORTAL_PURCHASE_HISTORY_BINDINGS_JSON,
  load: async ({ companyId, erpCompany, instanceId, sku, itemCode, from, to }) => {
    // The OSF snapshot's exact item code must match a company SKU. Never try aliases.
    if (sku !== itemCode) return { status: "MAPPING_UNAVAILABLE" };
    const [products, instance, erpLocation] = await Promise.all([
      prisma.productItem.findMany({
        where: { companyId, sku, status: { not: "archived" } },
        select: { id: true }, take: 2,
      }),
      prisma.erpnextInstance.findFirst({
        where: { id: instanceId, companyId },
        select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
      }),
      prisma.companyLocation.findFirst({
        where: { companyId, erpnextInstanceId: instanceId, erpnextCompany: erpCompany },
        select: { id: true },
      }),
    ]);
    if (products.length > 1) return { status: "MAPPING_AMBIGUOUS" };
    if (!products.length || !erpLocation || !instance) return { status: "MAPPING_UNAVAILABLE" };
    if (!instance.baseUrl || !instance.apiKey || !instance.apiSecret) throw new Error("ERP unavailable");
    const cfg = { ...instance, baseUrl: instance.baseUrl.replace(/\/$/, "") };
    const mapping = await verifyExactErpItem(cfg, itemCode);
    if (mapping !== "VERIFIED") return { status: mapping };
    const history = await fetchPurchaseHistory({ cfg, erpCompany, itemCode, from, to });
    return {
      status: "OK",
      instanceLabel: instance.label,
      ...history,
      records: history.records.map((record) => ({ ...record, erpCompany })),
    };
  },
});
