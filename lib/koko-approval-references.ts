import { normalizeKokoReference } from "@/lib/koko-approval-reference";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type KokoReferenceDb = Pick<
  typeof prisma,
  "approvalRequest" | "approvalKokoReference"
>;

const activeKokoOrderWhere = {
  orderId: { not: null },
  order: {
    NOT: {
      financialStatus: { equals: "voided", mode: "insensitive" as const },
    },
  },
};

/** Drop stored KOKO refs for an order so the same reference can be reused. */
export async function releaseKokoReferencesForOrder(
  orderId: string,
  db: KokoReferenceDb = prisma,
): Promise<void> {
  const approvals = await db.approvalRequest.findMany({
    where: { orderId },
    select: { id: true },
  });
  if (approvals.length === 0) return;

  const approvalIds = approvals.map((row) => row.id);
  await db.approvalKokoReference.deleteMany({
    where: { approvalRequestId: { in: approvalIds } },
  });
  await db.approvalRequest.updateMany({
    where: { id: { in: approvalIds }, kokoReference: { not: null } },
    data: { kokoReference: null },
  });
}

export async function releaseKokoReferencesForOrderInTx(
  orderId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await releaseKokoReferencesForOrder(orderId, tx);
}

export async function findTakenKokoReferences(
  companyId: string,
  normalizedReferences: string[],
  excludeApprovalId?: string,
): Promise<string[]> {
  if (normalizedReferences.length === 0) return [];

  const fromChild = await prisma.approvalKokoReference.findMany({
    where: {
      companyId,
      reference: { in: normalizedReferences },
      approvalRequest: {
        ...activeKokoOrderWhere,
        ...(excludeApprovalId ? { id: { not: excludeApprovalId } } : {}),
      },
    },
    select: { reference: true },
  });

  const fromLegacy = await prisma.approvalRequest.findMany({
    where: {
      companyId,
      kokoReference: { in: normalizedReferences },
      ...activeKokoOrderWhere,
      ...(excludeApprovalId ? { id: { not: excludeApprovalId } } : {}),
    },
    select: { kokoReference: true },
  });

  const taken = new Set<string>();
  for (const row of fromChild) taken.add(row.reference);
  for (const row of fromLegacy) {
    if (row.kokoReference) taken.add(row.kokoReference);
  }
  return normalizedReferences.filter((ref) => taken.has(ref));
}

export type KokoApprovalReferenceEntry = {
  reference: string;
  normalized: string;
  amount: number;
};

export type ParsedKokoApprovalPayload = {
  multipleKokoPayments: boolean;
  entries: KokoApprovalReferenceEntry[];
  /** First normalized reference — stored on ApprovalRequest.kokoReference for legacy paths. */
  primaryReference: string;
};

export function roundKokoMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function validateKokoReferenceAmountTotal(
  entries: Array<{ amount: number }>,
  targetAmount: number,
): string | null {
  const target = roundKokoMoney(targetAmount);
  if (!Number.isFinite(target) || target <= 0) {
    return "Order amount is missing — cannot validate KOKO payment totals.";
  }
  const sum = roundKokoMoney(
    entries.reduce((acc, entry) => acc + entry.amount, 0),
  );
  if (Math.abs(sum - target) > 0.01) {
    return `KOKO payment amounts must total Rs ${target.toFixed(2)} (entered Rs ${sum.toFixed(2)}).`;
  }
  return null;
}

export function parseKokoApprovalPayload(input: {
  multipleKokoPayments?: boolean;
  kokoReference?: string | null;
  kokoReferences?: Array<{ reference?: string | null; amount?: number | null }> | null;
  targetAmount: number;
}):
  | { ok: true; value: ParsedKokoApprovalPayload }
  | { ok: false; error: string; code: string } {
  const multiple = Boolean(input.multipleKokoPayments);

  if (multiple) {
    const rows = input.kokoReferences ?? [];
    if (rows.length < 2) {
      return {
        ok: false,
        code: "KOKO_REFERENCES_REQUIRED",
        error: "Add at least two KOKO reference numbers for multiple KOKO payments.",
      };
    }

    const entries: KokoApprovalReferenceEntry[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const raw = row.reference?.trim() ?? "";
      if (!raw) {
        return {
          ok: false,
          code: "KOKO_REFERENCE_REQUIRED",
          error: "Each KOKO payment needs a reference number.",
        };
      }
      const normalized = normalizeKokoReference(raw);
      if (seen.has(normalized)) {
        return {
          ok: false,
          code: "KOKO_REFERENCE_DUPLICATE",
          error: `Duplicate KOKO reference "${raw}" in this approval.`,
        };
      }
      seen.add(normalized);

      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          ok: false,
          code: "KOKO_AMOUNT_REQUIRED",
          error: "Each KOKO payment needs an amount in multiple-payment mode.",
        };
      }

      entries.push({
        reference: raw,
        normalized,
        amount: roundKokoMoney(amount),
      });
    }

    const totalError = validateKokoReferenceAmountTotal(entries, input.targetAmount);
    if (totalError) {
      return { ok: false, code: "KOKO_AMOUNT_TOTAL_MISMATCH", error: totalError };
    }

    return {
      ok: true,
      value: {
        multipleKokoPayments: true,
        entries,
        primaryReference: entries[0]!.normalized,
      },
    };
  }

  const singleRaw = input.kokoReference?.trim() ?? input.kokoReferences?.[0]?.reference?.trim() ?? "";
  if (!singleRaw) {
    return {
      ok: false,
      code: "KOKO_REFERENCE_REQUIRED",
      error: "KOKO reference number is required before approval.",
    };
  }

  const normalized = normalizeKokoReference(singleRaw);
  const target = roundKokoMoney(input.targetAmount);
  if (!Number.isFinite(target) || target <= 0) {
    return {
      ok: false,
      code: "KOKO_AMOUNT_TARGET_MISSING",
      error: "Order amount is missing — cannot record KOKO payment.",
    };
  }

  return {
    ok: true,
    value: {
      multipleKokoPayments: false,
      entries: [
        {
          reference: singleRaw,
          normalized,
          amount: target,
        },
      ],
      primaryReference: normalized,
    },
  };
}
