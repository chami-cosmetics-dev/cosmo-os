"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { notify } from "@/lib/notify";
import {
  budgetSaveBlockedReason,
  formatBudgetMonth,
} from "@/lib/sales-budget/budget-month";
import {
  BUDGET_REVENUE_PRICE,
  type BudgetPriceChange,
  type SalesBudgetPageData,
  type SalesBudgetRow,
  type SalesBudgetShopChannel,
  type SalesBudgetTab,
  type SalesBudgetVatFilter,
} from "@/lib/sales-budget/config";

/** One edited Budgeted Qty, with what it replaced (for revenue deltas / revert). */
type QtyEntry = {
  qty: number;
  /** Budgeted Revenue shown before the edit (the server total includes it). */
  baseRevenue: number | null;
  price: number | null;
};

/** Price used for Budgeted Revenue (same rule as the server: BUDGET_REVENUE_PRICE). */
const revenuePrice = (row: SalesBudgetRow) =>
  BUDGET_REVENUE_PRICE === "max" ? row.sellingPriceMax : row.sellingPriceMin;

const revenueFor = (qty: number | null, price: number | null) =>
  qty == null || price == null ? null : Math.round(qty * price * 100) / 100;

/**
 * Editable Budgeted Qty for a specific merchant / shop view. Unsaved edits ("drafts") live
 * only while the view (tab + channel + merchant/shop + VAT) stays the same; changing it
 * discards them. Save writes them into next month's saved budget; the rows then come back
 * from the server with the saved values (`row.savedEdit`).
 */
export function useBudgetQtyEdits(input: {
  tab: SalesBudgetTab;
  shopChannel: SalesBudgetShopChannel | null;
  /** Selected merchant / shop; null = "All" (not editable; nor is the "all" channel). */
  entity: string | null;
  vat: SalesBudgetVatFilter;
  data: SalesBudgetPageData | null;
  /** Reload the page data (after a save). */
  onSaved: () => void;
}) {
  const { tab, shopChannel, entity, vat, data, onSaved } = input;
  const scopeKey = [tab, shopChannel ?? "-", entity ?? "all", vat].join("|");
  // Only a specific merchant / shop and a single channel: "All Merchants", "All Shops" and
  // the SHOP tab's "All" channel are combined views, so an edit can't be allocated.
  const editable = entity != null && !(tab === "shop" && shopChannel === "all");

  const [drafts, setDrafts] = useState<{
    key: string;
    edits: Record<string, QtyEntry>;
  }>({
    key: scopeKey,
    edits: {},
  });
  const [saving, setSaving] = useState(false);
  /** Saved drafts stay on screen until the reloaded rows (with the saved values) arrive. */
  const clearOnData = useRef(false);

  // Leaving the view without saving reverts its edits.
  const draftCount =
    drafts.key === scopeKey ? Object.keys(drafts.edits).length : 0;
  // Drafts are tied to their view (`drafts.key`), so a new view already ignores them; this
  // only tells the user and clears them.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  useEffect(() => {
    const prev = draftsRef.current;
    if (prev.key === scopeKey) return;
    if (Object.keys(prev.edits).length > 0) {
      notify.info("Unsaved Budgeted Qty changes were discarded.");
    }
    setDrafts({ key: scopeKey, edits: {} });
  }, [scopeKey]);

  useEffect(() => {
    if (!clearOnData.current) return;
    clearOnData.current = false;
    setDrafts({ key: scopeKey, edits: {} });
  }, [data, scopeKey]);

  // Warn before closing / reloading the page with unsaved edits.
  useEffect(() => {
    if (draftCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older Chrome only prompts when returnValue is set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftCount]);

  const draftsHere = useMemo(
    () => (drafts.key === scopeKey ? drafts.edits : {}),
    [drafts, scopeKey],
  );

  const effectiveQty = useCallback(
    (row: SalesBudgetRow) => draftsHere[row.commonSku]?.qty ?? row.budgetedQty,
    [draftsHere],
  );
  const effectiveRevenue = useCallback(
    (row: SalesBudgetRow) => {
      const changed = draftsHere[row.commonSku];
      return changed
        ? revenueFor(changed.qty, changed.price)
        : row.budgetedRevenue;
    },
    [draftsHere],
  );

  const setQty = useCallback(
    (row: SalesBudgetRow, value: number) => {
      if (!editable || !Number.isInteger(value) || value < 0) return;
      setDrafts((prev) => {
        const edits = { ...(prev.key === scopeKey ? prev.edits : {}) };
        // Back to the shown (saved or calculated) value = no change.
        if (value === row.budgetedQty) {
          delete edits[row.commonSku];
        } else {
          edits[row.commonSku] = {
            qty: value,
            baseRevenue: row.budgetedRevenue,
            price: revenuePrice(row),
          };
        }
        return { key: scopeKey, edits };
      });
    },
    [editable, scopeKey],
  );

  /** Back to the shown (saved or calculated) value. */
  const revertRow = useCallback(
    (sku: string) => {
      setDrafts((prev) => {
        if (prev.key !== scopeKey || !prev.edits[sku]) return prev;
        const edits = { ...prev.edits };
        delete edits[sku];
        return { key: scopeKey, edits };
      });
    },
    [scopeKey],
  );

  const discardAll = useCallback(
    () => setDrafts({ key: scopeKey, edits: {} }),
    [scopeKey],
  );

  const budgetFile = data?.budgetFile ?? null;
  // Server's reason, else re-checked now (the page may stay open past month end).
  const blockedReason = budgetFile
    ? (budgetFile.blockedReason ??
      budgetSaveBlockedReason(budgetFile.targetMonth))
    : null;
  /** Save works on every view; it also writes this view's edits when there are any. */
  const canSave = budgetFile != null && !blockedReason && !saving;

  /** Server found saved prices that differ from today's; waiting for the user's choice. */
  const [priceQuestion, setPriceQuestion] = useState<{
    count: number;
    preview: BudgetPriceChange[];
    payload: object;
    clearDrafts: boolean;
  } | null>(null);

  const post = useCallback(
    async (
      payload: object,
      clearDrafts: boolean,
      prices: "ask" | "update" | "keep",
    ) => {
      if (!budgetFile) return;
      setSaving(true);
      try {
        const res = await fetch("/api/admin/purchasing/sales-budget/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetMonth: budgetFile.targetMonth,
            prices,
            ...payload,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 409 && body.code === "prices_changed") {
          setPriceQuestion({
            count: body.count,
            preview: body.preview ?? [],
            payload,
            clearDrafts,
          });
          return;
        }
        if (!res.ok) throw new Error(body.error || "Could not save the budget");
        if (clearDrafts) clearOnData.current = true;
        onSaved();
        notify.success(
          `Saved for ${formatBudgetMonth(budgetFile.targetMonth, "short")}`,
        );
      } catch (err) {
        notify.error(
          err instanceof Error ? err.message : "Could not save the budget",
        );
      } finally {
        setSaving(false);
      }
    },
    [budgetFile, onSaved],
  );

  const save = useCallback(async () => {
    if (!canSave) return;
    const withEdits = editable && entity != null && draftCount > 0;
    await post(
      withEdits
        ? {
            tab,
            channel: shopChannel,
            entity,
            vat,
            changes: Object.entries(draftsHere).map(([commonSku, e]) => ({
              commonSku,
              budgetedQty: e.qty,
            })),
          }
        : { changes: [] },
      withEdits,
      "ask",
    );
  }, [
    canSave,
    draftCount,
    draftsHere,
    editable,
    entity,
    post,
    shopChannel,
    tab,
    vat,
  ]);

  /** Price question: "update" / "keep" saves again with that choice; null = Cancel. */
  const answerPriceQuestion = useCallback(
    async (choice: "update" | "keep" | null) => {
      const question = priceQuestion;
      setPriceQuestion(null);
      if (!question || !choice) return;
      await post(question.payload, question.clearDrafts, choice);
    },
    [post, priceQuestion],
  );

  /** Server total + the revenue change of every edited row that matches the filters. */
  const totalRevenue = useMemo(() => {
    if (!data) return null;
    const inView = new Set(data.filteredSkus);
    let total = data.budgetedRevenueTotal;
    for (const [sku, e] of Object.entries(draftsHere)) {
      if (!inView.has(sku)) continue;
      const delta = (revenueFor(e.qty, e.price) ?? 0) - (e.baseRevenue ?? 0);
      total = Math.round(((total ?? 0) + delta) * 100) / 100;
    }
    return total;
  }, [data, draftsHere]);

  return {
    editable,
    draftCount,
    saving,
    canSave,
    priceQuestion,
    answerPriceQuestion,
    blockedReason,
    budgetFile,
    isDirty: (sku: string) => sku in draftsHere,
    effectiveQty,
    effectiveRevenue,
    setQty,
    revertRow,
    discardAll,
    save,
    totalRevenue,
  };
}
