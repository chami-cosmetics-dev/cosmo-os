import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { erpErrorMessage } from "@/lib/material-transfer/erp-error";
import {
  listTransferWarehouses,
  loadTransferSlotWarehouses,
  lookupTransferItem,
  MaterialTransferError,
  resolveTransferSlots,
} from "@/lib/material-transfer/erp";
import { lookupShopReturnItem } from "@/lib/material-transfer/shop-return-lookup";
import { resolveShopToMain, type ShopReturnWarehouse } from "@/lib/material-transfer/shop-return";
import type { TransferSlot } from "@/lib/material-transfer/types";
import { materialTransferLookupSchema, materialTransferShopLookupSchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function shopWarehouses(companyId: string) {
  const tagged: ShopReturnWarehouse[] = [];
  const slots: TransferSlot[] = ["erp1", "erp2"];
  for (const slot of slots) {
    try {
      const loaded = await loadTransferSlotWarehouses(companyId, slot);
      for (const row of loaded.warehouses) tagged.push({ ...row, slot });
    } catch (error) {
      if (error instanceof MaterialTransferError && error.message.includes("not configured")) continue;
      throw error;
    }
  }
  return tagged;
}

export async function POST(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!auth.canWrite) {
    if (!auth.canShopReturn || !auth.canReceive) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const shopParsed = materialTransferShopLookupSchema.safeParse(body);
    if (!shopParsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: shopParsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const resolved = resolveShopToMain(auth.scope.outletName, await shopWarehouses(auth.companyId));
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: 409 });
      }
      const item = await lookupShopReturnItem(auth.companyId, resolved.legs, shopParsed.data.code);
      return NextResponse.json({ item });
    } catch (error) {
      if (error instanceof MaterialTransferError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[material-transfer/lookup]", error);
      return NextResponse.json({ error: erpErrorMessage(error) }, { status: 502 });
    }
  }

  const parsed = materialTransferLookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {

    const slots = await resolveTransferSlots(auth.companyId);
    const instance = parsed.data.slot === "erp1" ? slots.erp1 : slots.erp2;
    if (!instance) {
      throw new MaterialTransferError(
        parsed.data.slot === "erp1" ? "ERP1 is not configured" : "ERP2 is not configured",
      );
    }
    const warehouses = await listTransferWarehouses(instance.cfg);
    const item = await lookupTransferItem({
      cfg: instance.cfg,
      slot: parsed.data.slot,
      code: parsed.data.code,
      sourceWarehouse: parsed.data.sourceWarehouse,
      company: parsed.data.company,
      warehouses,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/lookup]", error);
    return NextResponse.json({ error: erpErrorMessage(error) }, { status: 502 });
  }
}
