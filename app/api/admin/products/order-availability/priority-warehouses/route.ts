import { NextRequest, NextResponse } from "next/server";

import {
  OrderAvailabilityPriorityError,
  listOrderAvailabilityMainWarehouses,
  loadPriorityWarehouseRows,
  savePriorityWarehouses,
  slotsFromRows,
} from "@/lib/order-availability/priority-warehouses";
import { ORDER_AVAILABILITY_MANAGE_PERMISSION } from "@/lib/order-availability/types";
import { OsfErpError } from "@/lib/osf/erp-stock";
import { requirePermission } from "@/lib/rbac";
import { orderAvailabilityPriorityWarehousesSchema } from "@/lib/validation/order-availability";

export const dynamic = "force-dynamic";

async function companyIdOrError() {
  const auth = await requirePermission(ORDER_AVAILABILITY_MANAGE_PERMISSION);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return { ok: false as const, response: NextResponse.json({ error: "Company not found" }, { status: 400 }) };
  }
  return { ok: true as const, companyId };
}

export async function GET() {
  const auth = await companyIdOrError();
  if (!auth.ok) return auth.response;

  const rows = await loadPriorityWarehouseRows(auth.companyId);
  try {
    const warehouses = await listOrderAvailabilityMainWarehouses(auth.companyId);
    return NextResponse.json({
      warehouses: warehouses.map((row) => ({ name: row.name, company: row.company })),
      slots: slotsFromRows(rows, warehouses),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERP fetch failed";
    console.error("[order-availability] priority warehouses GET failed", error);
    return NextResponse.json({
      warehouses: rows.map((row) => ({ name: row.warehouse, company: "" })),
      slots: slotsFromRows(rows, []),
      error: `Could not read ERP2 warehouses: ${message.slice(0, 300)}`,
    });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await companyIdOrError();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = orderAvailabilityPriorityWarehousesSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "Invalid priority warehouses", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const warehouses = await listOrderAvailabilityMainWarehouses(auth.companyId);
    const allowed = new Set(warehouses.map((row) => row.name));
    const saved = await savePriorityWarehouses(auth.companyId, parsed.data.slots, allowed);
    return NextResponse.json({
      warehouses: warehouses.map((row) => ({ name: row.name, company: row.company })),
      slots: slotsFromRows(saved, warehouses),
    });
  } catch (error) {
    if (error instanceof OrderAvailabilityPriorityError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "ERP fetch failed";
    console.error("[order-availability] priority warehouses PUT failed", error);
    return NextResponse.json(
      { error: `Could not save priority warehouses: ${message.slice(0, 300)}` },
      { status: error instanceof OsfErpError ? 502 : 500 },
    );
  }
}
