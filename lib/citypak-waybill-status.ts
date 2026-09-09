import { Prisma } from "@prisma/client";

import {
  CITYPAK_WAYBILL_SOURCE,
  citypakStatusLabel,
  isCitypakTerminalStatus,
  parseCitypakPushPayload,
  readCitypakWaybillStatus,
  trackCitypakShipment,
  type CitypakShipmentStatus,
  type CitypakTrackingCheckpoint,
} from "@/lib/citypak-api";
import { prisma } from "@/lib/prisma";

/** Gap between CityPak track calls in a sweep — the API has no bulk endpoint. */
export const CITYPAK_STATUS_SWEEP_GAP_MS = 400;
/** Skip waybills tracked more recently than this in the scheduled sweep. */
export const CITYPAK_STATUS_STALE_MS = 6 * 60 * 60 * 1000;
export const CITYPAK_STATUS_SWEEP_DEFAULT_LIMIT = 200;
export const CITYPAK_STATUS_SWEEP_MAX_LIMIT = 1000;
/** Cap for one interactive "check all" run so the request stays inside maxDuration. */
export const CITYPAK_STATUS_BULK_MAX_LIMIT = 100;

/** Fields we stamp onto OrderWaybill.rawPayload for CityPak shipments. */
export type CitypakWaybillStatusFields = {
  citypakStatus: CitypakShipmentStatus;
  citypakStatusLabel: string;
  citypakStatusCheckpoints: CitypakTrackingCheckpoint[];
  citypakStatusCheckedAt: string;
  citypakDeliveredAt: string | null;
  citypakPodImageUrl: string;
  citypakStatusReceiverName: string;
};

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function resolveCitypakToken(
  companyId: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  const accountDbId = readString(payload, "citypakAccountDbId");
  const accountId = readString(payload, "citypakAccountId");
  const account = accountDbId
    ? await prisma.citypakAccount.findFirst({
        where: { id: accountDbId, companyId },
        select: { apiToken: true },
      })
    : accountId
      ? await prisma.citypakAccount.findFirst({
          where: { companyId, accountId },
          select: { apiToken: true },
        })
      : null;
  return account?.apiToken ?? null;
}

function mergeStatusFields(
  payload: Record<string, unknown>,
  fields: Partial<CitypakWaybillStatusFields>
): Prisma.InputJsonValue {
  return { ...payload, ...fields } as Prisma.InputJsonValue;
}

export type RefreshCitypakWaybillStatusResult =
  | {
      ok: true;
      waybillId: string;
      trackingNumber: string;
      status: CitypakShipmentStatus;
      statusLabel: string;
      deliveredAt: string | null;
      checkedAt: string;
      checkpoints: CitypakTrackingCheckpoint[];
    }
  | { ok: false; error: string; status: number };

/** Pull the latest CityPak status for one waybill and stamp it onto rawPayload. */
export async function refreshCitypakWaybillStatus(input: {
  companyId: string;
  waybillId: string;
}): Promise<RefreshCitypakWaybillStatusResult> {
  const waybill = await prisma.orderWaybill.findFirst({
    where: {
      id: input.waybillId,
      companyId: input.companyId,
      source: CITYPAK_WAYBILL_SOURCE,
    },
    select: { id: true, waybillNo: true, rawPayload: true },
  });
  if (!waybill) {
    return { ok: false, error: "No CityPak waybill found for this id", status: 404 };
  }

  const payload = asRecord(waybill.rawPayload);
  const token = await resolveCitypakToken(input.companyId, payload);
  if (!token) {
    return { ok: false, error: "CityPak API token not found for this waybill", status: 404 };
  }

  const tracked = await trackCitypakShipment({ token, trackingNumber: waybill.waybillNo });
  if (!tracked.ok) {
    return { ok: false, error: tracked.error, status: tracked.status ?? 502 };
  }

  const checkedAt = new Date().toISOString();
  const fields: CitypakWaybillStatusFields = {
    citypakStatus: tracked.status,
    citypakStatusLabel: tracked.statusLabel,
    citypakStatusCheckpoints: tracked.checkpoints,
    citypakStatusCheckedAt: checkedAt,
    citypakDeliveredAt: tracked.deliveredAt,
    citypakPodImageUrl: tracked.podImageUrl,
    citypakStatusReceiverName: tracked.receiverName,
  };

  await prisma.orderWaybill.update({
    where: { id: waybill.id },
    data: { rawPayload: mergeStatusFields(payload, fields) },
  });

  return {
    ok: true,
    waybillId: waybill.id,
    trackingNumber: waybill.waybillNo,
    status: tracked.status,
    statusLabel: tracked.statusLabel,
    deliveredAt: tracked.deliveredAt,
    checkedAt,
    checkpoints: tracked.checkpoints,
  };
}

export type CitypakStatusSweepResult = {
  checked: number;
  updated: number;
  delivered: number;
  failed: number;
};

/** CityPak has no bulk tracking endpoint — poll one waybill at a time with a small gap. */
async function refreshSequentially(
  rows: Array<{ id: string; companyId: string }>
): Promise<CitypakStatusSweepResult> {
  const result: CitypakStatusSweepResult = { checked: 0, updated: 0, delivered: 0, failed: 0 };

  for (const row of rows) {
    result.checked += 1;
    const refreshed = await refreshCitypakWaybillStatus({
      companyId: row.companyId,
      waybillId: row.id,
    });
    if (!refreshed.ok) {
      result.failed += 1;
    } else {
      result.updated += 1;
      if (refreshed.status === "delivered") result.delivered += 1;
    }
    if (rows.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, CITYPAK_STATUS_SWEEP_GAP_MS));
    }
  }

  return result;
}

/**
 * On-demand refresh for a set of waybills — the "Check all statuses" button on
 * Waybill Lookup. Delivered / returned rows are skipped by default: their status
 * can no longer change, so polling them only burns time.
 */
export async function refreshCitypakWaybillStatusesByIds(input: {
  companyId: string;
  waybillIds: string[];
  includeTerminal?: boolean;
}): Promise<CitypakStatusSweepResult & { skipped: number }> {
  const ids = Array.from(new Set(input.waybillIds)).slice(0, CITYPAK_STATUS_BULK_MAX_LIMIT);
  if (ids.length === 0) {
    return { checked: 0, updated: 0, delivered: 0, failed: 0, skipped: 0 };
  }

  const rows = await prisma.orderWaybill.findMany({
    where: {
      id: { in: ids },
      companyId: input.companyId,
      source: CITYPAK_WAYBILL_SOURCE,
    },
    select: { id: true, companyId: true, rawPayload: true },
  });

  const due = input.includeTerminal
    ? rows
    : rows.filter((row) => {
        const { status } = readCitypakWaybillStatus(row.rawPayload);
        return !status || !isCitypakTerminalStatus(status);
      });

  const result = await refreshSequentially(due);
  return { ...result, skipped: rows.length - due.length };
}

/**
 * Poll CityPak for every active (non-terminal) API waybill whose status is
 * missing or older than {@link CITYPAK_STATUS_STALE_MS}. Runs sequentially with
 * a small gap — CityPak has no bulk tracking endpoint.
 */
export async function sweepCitypakWaybillStatuses(input?: {
  companyId?: string;
  limit?: number;
  staleMs?: number;
  now?: Date;
}): Promise<CitypakStatusSweepResult> {
  const now = input?.now ?? new Date();
  const staleMs = input?.staleMs ?? CITYPAK_STATUS_STALE_MS;
  const limit = Math.min(
    Math.max(1, input?.limit ?? CITYPAK_STATUS_SWEEP_DEFAULT_LIMIT),
    CITYPAK_STATUS_SWEEP_MAX_LIMIT
  );
  const staleBefore = new Date(now.getTime() - staleMs).toISOString();

  const candidates = await prisma.orderWaybill.findMany({
    where: {
      source: CITYPAK_WAYBILL_SOURCE,
      ...(input?.companyId ? { companyId: input.companyId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, companyId: true, rawPayload: true },
    // Over-fetch: JSON status filtering is done in-process below.
    take: limit * 4,
  });

  const due = candidates
    .filter((row) => {
      const { status, checkedAt } = readCitypakWaybillStatus(row.rawPayload);
      if (status && isCitypakTerminalStatus(status)) return false;
      if (!checkedAt) return true;
      return checkedAt < staleBefore;
    })
    .slice(0, limit);

  return refreshSequentially(due);
}

export type ApplyCitypakPushResult =
  | { ok: true; matched: number; status: CitypakShipmentStatus }
  | { ok: false; error: string };

/**
 * Apply one CityPak push-API scan to the matching waybill(s). Matches on
 * tracking number; appends the scan to the checkpoint list and updates the
 * current status only when the push is newer than what we last recorded.
 */
export async function applyCitypakPushUpdate(input: {
  payload: unknown;
  companyId?: string;
}): Promise<ApplyCitypakPushResult> {
  const push = parseCitypakPushPayload(input.payload);
  if (!push) {
    return { ok: false, error: "Push payload missing tracking_number" };
  }

  const waybills = await prisma.orderWaybill.findMany({
    where: {
      source: CITYPAK_WAYBILL_SOURCE,
      waybillNo: push.trackingNumber,
      ...(input.companyId ? { companyId: input.companyId } : {}),
    },
    select: { id: true, rawPayload: true },
  });

  if (waybills.length === 0) {
    return { ok: false, error: `No CityPak waybill for tracking number ${push.trackingNumber}` };
  }

  const scanAt = push.at ?? new Date().toISOString();
  const checkpoint: CitypakTrackingCheckpoint = {
    at: scanAt,
    label: push.label,
    code: push.code,
    location: "",
    description: push.reason,
    status: push.status,
  };

  for (const waybill of waybills) {
    const payload = asRecord(waybill.rawPayload);
    const existing = Array.isArray(payload.citypakStatusCheckpoints)
      ? (payload.citypakStatusCheckpoints as CitypakTrackingCheckpoint[])
      : [];
    const alreadyRecorded = existing.some(
      (cp) => cp.at === checkpoint.at && cp.label === checkpoint.label
    );
    const checkpoints = alreadyRecorded ? existing : [...existing, checkpoint];

    const latest = checkpoints[checkpoints.length - 1] ?? checkpoint;
    const fields: Partial<CitypakWaybillStatusFields> = {
      citypakStatusCheckpoints: checkpoints,
      citypakStatus: latest.status,
      citypakStatusLabel: citypakStatusLabel(latest.status),
      citypakStatusCheckedAt: new Date().toISOString(),
    };
    if (push.status === "delivered") {
      fields.citypakDeliveredAt = scanAt;
    }

    await prisma.orderWaybill.update({
      where: { id: waybill.id },
      data: { rawPayload: mergeStatusFields(payload, fields) },
    });
  }

  return { ok: true, matched: waybills.length, status: push.status };
}
