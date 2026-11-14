import { lineKey } from "@/lib/material-transfer/lines";
import type { TransferLine, TransferSlot } from "@/lib/material-transfer/types";

export const SEND_DRAFT_VERSION = 1 as const;
export const SEND_DRAFT_KEY = "material_transfer_send_draft_v1";

const MAX_QTY = 100_000;

export type MaterialTransferSendDraft = {
  version: typeof SEND_DRAFT_VERSION;
  companyId: string;
  userId: string;
  updatedAt: string;
  slot: TransferSlot;
  company: string;
  source: string;
  target: string;
  lines: TransferLine[];
};

export function buildSendDraftStorageKey(companyId: string, userId: string): string {
  return `${SEND_DRAFT_KEY}:${companyId}:${userId}`;
}

function parseLine(value: unknown): TransferLine | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<TransferLine>;
  const itemCode = String(row.itemCode ?? "").trim();
  if (!itemCode) return null;
  const qty = Number(row.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null;
  const availableRaw = row.availableQty;
  const availableQty =
    typeof availableRaw === "number" && Number.isFinite(availableRaw) ? availableRaw : null;
  return {
    itemCode,
    itemName: String(row.itemName ?? itemCode).trim() || itemCode,
    barcode: String(row.barcode ?? "").trim(),
    uom: String(row.uom ?? "").trim() || "Nos",
    qty,
    availableQty,
    taxStatus: String(row.taxStatus ?? "").trim() || null,
    slot: row.slot === "erp1" || row.slot === "erp2" ? row.slot : null,
  };
}

/** Drop blank lines, clamp fields, and keep the first row for each SKU. */
export function normalizeSendDraft(draft: MaterialTransferSendDraft): MaterialTransferSendDraft {
  const seen = new Set<string>();
  const lines: TransferLine[] = [];
  for (const row of draft.lines) {
    const line = parseLine(row);
    if (!line) continue;
    const key = lineKey(line.itemCode);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  const slot: TransferSlot = draft.slot === "erp2" ? "erp2" : "erp1";
  return {
    version: SEND_DRAFT_VERSION,
    companyId: draft.companyId,
    userId: draft.userId,
    updatedAt: draft.updatedAt,
    slot,
    company: String(draft.company ?? "").trim(),
    source: String(draft.source ?? "").trim(),
    target: String(draft.target ?? "").trim(),
    lines,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadSendDraft(companyId: string, userId: string): MaterialTransferSendDraft | null {
  if (!isBrowser() || !companyId || !userId) return null;
  try {
    const raw = window.localStorage.getItem(buildSendDraftStorageKey(companyId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MaterialTransferSendDraft;
    if (parsed.version !== SEND_DRAFT_VERSION) return null;
    if (parsed.companyId !== companyId || parsed.userId !== userId) return null;
    if (parsed.slot !== "erp1" && parsed.slot !== "erp2") return null;
    const normalized = normalizeSendDraft(parsed);
    return normalized.lines.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

export function saveSendDraft(draft: MaterialTransferSendDraft): void {
  if (!isBrowser() || !draft.companyId || !draft.userId) return;
  const normalized = normalizeSendDraft({
    ...draft,
    updatedAt: new Date().toISOString(),
  });
  try {
    const key = buildSendDraftStorageKey(normalized.companyId, normalized.userId);
    if (normalized.lines.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearSendDraft(companyId: string, userId: string): void {
  if (!isBrowser() || !companyId || !userId) return;
  try {
    window.localStorage.removeItem(buildSendDraftStorageKey(companyId, userId));
  } catch {
    // Ignore storage failures.
  }
}
