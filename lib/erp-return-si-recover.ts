import {
  fetchErpCreditNotesAgainst,
} from "@/lib/erp-credit-note-order-sync";
import { mergeErpReturnSalesInvoiceIds, normalizeErpReturnSalesInvoiceIds } from "@/lib/erp-return-si";
import { prisma } from "@/lib/prisma";

export type RecoverReturnSiResult = {
  orderId: string;
  originalInvoice: string | null;
  returnInvoiceNames: string[];
  status: "updated" | "dry_run" | "skipped" | "no_return_si" | "no_erp" | "error";
  detail?: string;
};

type RecoverOptions = {
  companyId: string;
  orderId?: string | null;
  limit?: number;
  dryRun?: boolean;
};

/**
 * Backfill Return SI ids onto voided/returned orders (or a single order) from ERP
 * `return_against` lookup. Never voids active orders — only appends ids.
 */
export async function recoverErpReturnSalesInvoiceIds(
  options: RecoverOptions,
): Promise<{ checked: number; updated: number; results: RecoverReturnSiResult[] }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const dryRun = options.dryRun === true;

  const candidates = options.orderId
    ? await prisma.order.findMany({
        where: { id: options.orderId, companyId: options.companyId },
        take: 1,
        select: {
          id: true,
          name: true,
          erpnextInvoiceId: true,
          erpReturnSalesInvoiceIds: true,
          financialStatus: true,
          fulfillmentStage: true,
          companyLocation: {
            select: {
              erpnextInstance: {
                select: { baseUrl: true, apiKey: true, apiSecret: true },
              },
            },
          },
        },
      })
    : await prisma.order.findMany({
        where: {
          companyId: options.companyId,
          financialStatus: "voided",
          fulfillmentStage: "returned",
          erpnextInvoiceId: { not: null },
          NOT: [{ erpnextInvoiceId: "pending" }, { erpnextInvoiceId: "pending_approval" }],
          companyLocation: { erpnextInstanceId: { not: null } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          erpnextInvoiceId: true,
          erpReturnSalesInvoiceIds: true,
          financialStatus: true,
          fulfillmentStage: true,
          companyLocation: {
            select: {
              erpnextInstance: {
                select: { baseUrl: true, apiKey: true, apiSecret: true },
              },
            },
          },
        },
      });

  const results: RecoverReturnSiResult[] = [];
  let updated = 0;

  for (const order of candidates) {
    const originalInvoice = order.erpnextInvoiceId?.trim() || order.name?.trim() || null;
    const instance = order.companyLocation?.erpnextInstance;
    if (!originalInvoice || !instance) {
      results.push({
        orderId: order.id,
        originalInvoice,
        returnInvoiceNames: [],
        status: "no_erp",
        detail: "Missing invoice name or ERP instance",
      });
      continue;
    }

    // Single-order mode may target an active order — still only append ids, never void.
    try {
      const creditNotes = await fetchErpCreditNotesAgainst(
        {
          baseUrl: instance.baseUrl,
          apiKey: instance.apiKey,
          apiSecret: instance.apiSecret,
        },
        originalInvoice,
      );
      const names = normalizeErpReturnSalesInvoiceIds(
        creditNotes
          .filter((cn) => cn.docstatus === 1 || cn.docstatus === 2)
          .map((cn) => cn.name),
      );
      if (names.length === 0) {
        results.push({
          orderId: order.id,
          originalInvoice,
          returnInvoiceNames: [],
          status: "no_return_si",
        });
        continue;
      }

      const merged = mergeErpReturnSalesInvoiceIds(order.erpReturnSalesInvoiceIds, names);
      const unchanged =
        merged.length === order.erpReturnSalesInvoiceIds.length &&
        merged.every((id, i) => id === order.erpReturnSalesInvoiceIds[i]);

      if (unchanged) {
        results.push({
          orderId: order.id,
          originalInvoice,
          returnInvoiceNames: merged,
          status: "skipped",
          detail: "Already up to date",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          orderId: order.id,
          originalInvoice,
          returnInvoiceNames: merged,
          status: "dry_run",
        });
        updated += 1;
        continue;
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { erpReturnSalesInvoiceIds: merged },
      });
      results.push({
        orderId: order.id,
        originalInvoice,
        returnInvoiceNames: merged,
        status: "updated",
      });
      updated += 1;
    } catch (err) {
      results.push({
        orderId: order.id,
        originalInvoice,
        returnInvoiceNames: [],
        status: "error",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { checked: candidates.length, updated, results };
}
