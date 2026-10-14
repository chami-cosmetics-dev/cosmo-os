import "server-only";

import {
  loadTransferSlotWarehouses,
  lookupTransferItem,
  MaterialTransferError,
} from "@/lib/material-transfer/erp";
import { shopReturnDestination, type ShopReturnLeg } from "@/lib/material-transfer/shop-return";
import type { TransferLookupItem, TransferSlot } from "@/lib/material-transfer/types";

export async function lookupShopReturnItem(
  companyId: string,
  legs: ShopReturnLeg[],
  code: string,
): Promise<TransferLookupItem> {
  const found = new Map<TransferSlot, TransferLookupItem>();
  for (const leg of legs) {
    const { instance, warehouses } = await loadTransferSlotWarehouses(companyId, leg.slot);
    try {
      const item = await lookupTransferItem({
        cfg: instance.cfg,
        slot: leg.slot,
        code,
        sourceWarehouse: leg.sourceWarehouse,
        warehouses,
        company: leg.slot === "erp2" ? leg.erpCompany : null,
        skipVatCheck: true,
      });
      found.set(leg.slot, item);
    } catch (error) {
      if (error instanceof MaterialTransferError && error.message.startsWith("No item found")) continue;
      throw error;
    }
  }

  const erp1 = found.get("erp1") ?? null;
  const erp2 = found.get("erp2") ?? null;
  if (!erp1 && !erp2) {
    throw new MaterialTransferError(`No item found for ${code}`);
  }
  const taxStatus = erp1?.taxStatus ?? erp2?.taxStatus ?? null;
  const slot = shopReturnDestination(taxStatus);
  const item = found.get(slot) ?? null;
  const label = item?.itemCode || erp1?.itemCode || erp2?.itemCode || code;
  if (!legs.some((leg) => leg.slot === slot)) {
    throw new MaterialTransferError(
      slot === "erp1"
        ? `${label} is VAT. This shop has no ERP1 warehouse for it.`
        : `${label} is not VAT. This shop has no ERP2 warehouse for it.`,
    );
  }
  if (!item) {
    throw new MaterialTransferError(
      slot === "erp1" ? `${label} is VAT. It is not on ERP1.` : `${label} is not VAT. It is not on ERP2.`,
    );
  }
  return { ...item, taxStatus, slot };
}
