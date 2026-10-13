import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import {
  assertSlotVatLines,
  assertSourceCovers,
  loadTransferSlotWarehouses,
  MaterialTransferError,
} from "@/lib/material-transfer/erp";
import { recordShopReturn } from "@/lib/material-transfer/receipts";
import { resolveShopToMain, type ShopReturnWarehouse } from "@/lib/material-transfer/shop-return";
import type { TransferSlot } from "@/lib/material-transfer/types";
import { materialTransferShopReturnSchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function warehousesForOutlet(companyId: string) {
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

export async function GET() {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.canReceive) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const resolved = resolveShopToMain(auth.scope.outletName, await warehousesForOutlet(auth.companyId));
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 409 });
    return NextResponse.json({
      slot: resolved.slot,
      erpCompany: resolved.erpCompany,
      sourceWarehouse: resolved.sourceWarehouse,
      targetWarehouse: resolved.targetWarehouse,
    });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/shop-return]", error);
    return NextResponse.json({ error: "Could not resolve the shop warehouse" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.canReceive) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = materialTransferShopReturnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const resolved = resolveShopToMain(auth.scope.outletName, await warehousesForOutlet(auth.companyId));
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 409 });
    const { instance } = await loadTransferSlotWarehouses(auth.companyId, resolved.slot);
    if (resolved.slot === "erp1") {
      await assertSlotVatLines(
        instance.cfg,
        parsed.data.lines.map((line) => line.itemCode),
      );
    }
    await assertSourceCovers(instance.cfg, resolved.sourceWarehouse, parsed.data.lines);
    const created = await recordShopReturn({
      companyId: auth.companyId,
      slot: resolved.slot,
      erpCompany: resolved.erpCompany,
      sourceWarehouse: resolved.sourceWarehouse,
      targetWarehouse: resolved.targetWarehouse,
      createdByUserId: auth.context.user?.id ?? null,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ id: created.id, erpName: null }, { status: 201 });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/shop-return]", error);
    return NextResponse.json({ error: "Could not send the shop return" }, { status: 500 });
  }
}
