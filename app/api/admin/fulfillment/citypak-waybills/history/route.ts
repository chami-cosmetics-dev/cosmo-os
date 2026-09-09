import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";
import {
  archiveCitypakApiWaybills,
  clearCitypakWaybillPdfCache,
  listCitypakApiWaybillBatches,
} from "@/lib/order-waybills";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidOrUuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const READ_PERMISSIONS = [
  "fulfillment.ready_dispatch.read",
  "fulfillment.ready_dispatch.dispatch",
  "fulfillment.waybill_lookup.read",
  "fulfillment.waybill_lookup.import",
];

const MANAGE_PERMISSIONS = [
  "fulfillment.ready_dispatch.dispatch",
  "fulfillment.waybill_lookup.import",
];

const scopeSchema = z
  .object({
    batchId: cuidOrUuidSchema.optional(),
    waybillIds: z.array(cuidOrUuidSchema).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.batchId || value.waybillIds?.length || value.all), {
    message: "Select waybills, a batch, or all history.",
  });

const patchSchema = z.object({
  action: z.literal("clear_cache"),
  all: z.literal(true),
});

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function getCompanyId(permissions: string[]) {
  const auth = await requireAnyPermission(permissions);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }),
    };
  }
  return { ok: true as const, companyId, userId: auth.context!.user!.id };
}

export async function GET(request: NextRequest) {
  const auth = await getCompanyId(READ_PERMISSIONS);
  if (!auth.ok) return auth.response;

  const today = formatAppIsoDate(new Date());
  const fromRaw = request.nextUrl.searchParams.get("from") ?? today;
  const toRaw = request.nextUrl.searchParams.get("to") ?? today;
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";

  const fromParsed = ymdSchema.safeParse(fromRaw);
  const toParsed = ymdSchema.safeParse(toRaw);
  if (!fromParsed.success || !toParsed.success) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const from = parseAppCalendarDayStart(fromParsed.data);
  const to = parseAppCalendarDayEnd(toParsed.data);
  if (!from || !to) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const batches = await listCitypakApiWaybillBatches(auth.companyId, {
    from,
    to,
    includeArchived,
  });
  return NextResponse.json({
    batches,
    from: fromParsed.data,
    to: toParsed.data,
    includeArchived,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getCompanyId(MANAGE_PERMISSIONS);
  if (!auth.ok) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cleared = await clearCitypakWaybillPdfCache({
    companyId: auth.companyId,
    all: true,
  });

  return NextResponse.json({
    message:
      cleared === 0
        ? "No saved prints to clear."
        : `Cleared ${cleared} saved print${cleared === 1 ? "" : "s"}. Next print downloads a fresh copy.`,
    cleared,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await getCompanyId(MANAGE_PERMISSIONS);
  if (!auth.ok) return auth.response;

  const parsed = scopeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const result = await archiveCitypakApiWaybills({
    companyId: auth.companyId,
    ...parsed.data,
  });

  await writeAuditLog({
    companyId: auth.companyId,
    actorUserId: auth.userId,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "OrderWaybill",
    entityId: parsed.data.batchId ?? "citypak_api_history",
    summary: `Cleared ${result.archivedWaybills} CityPak API waybill history rows (kept for date lookup)`,
    metadata: {
      batchId: parsed.data.batchId ?? null,
      waybillIds: parsed.data.waybillIds ?? null,
      all: parsed.data.all ?? false,
      archivedBatches: result.archivedBatches,
    },
  });

  return NextResponse.json({
    message: `Cleared ${result.archivedWaybills} waybill${result.archivedWaybills === 1 ? "" : "s"} from the list. Traces stay — turn on “Show cleared” or pick the date to find them.`,
    ...result,
  });
}
