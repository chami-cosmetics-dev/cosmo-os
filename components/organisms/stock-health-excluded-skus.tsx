"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Plus, X } from "lucide-react";

import { downloadFile } from "@/components/organisms/sales-budget-table-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import type { StockHealthExcludedSkuDto } from "@/lib/stock-health/config";
import { cn } from "@/lib/utils";

const API = "/api/admin/purchasing/stock-health/excluded-skus";

/** Comma / new-line separated (SKUs may contain spaces, so not split on spaces). */
function parseSkus(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRule(sku: string): boolean {
  return sku.endsWith("*");
}

function Chip({
  children,
  className,
  title,
  onRemove,
  removing,
  removeTitle,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onRemove?: () => void;
  removing: boolean;
  removeTitle: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 font-mono text-xs",
        onRemove ? "pr-1" : "pr-2.5",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label={removeTitle}
          title={removeTitle}
        >
          {removing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      ) : null}
    </span>
  );
}

/**
 * Common SKUs left out of every Stock Health table. Changes apply to the live figures
 * straight away; saved Monday snapshots keep the list they were taken with.
 */
export function StockHealthExcludedSkusCard({
  canManage,
  onChange,
}: {
  canManage: boolean;
  /** Called after the list changes, so the tables can reload. */
  onChange: () => void;
}) {
  const [skus, setSkus] = useState<StockHealthExcludedSkuDto[] | null>(null);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportExcluded = async () => {
    setExporting(true);
    try {
      await downloadFile(`${API}/export`, "stock-health-excluded.xlsx");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };
  const [removing, setRemoving] = useState<string | null>(null);

  const request = useCallback(async (init?: RequestInit, url = API) => {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Request failed");
    setSkus(body.skus as StockHealthExcludedSkuDto[]);
    return body as { added?: number };
  }, []);

  useEffect(() => {
    request().catch((error) =>
      notify.error(
        error instanceof Error ? error.message : "Failed to load excluded SKUs",
      ),
    );
  }, [request]);

  const add = async () => {
    const entered = parseSkus(input);
    if (entered.length === 0) return;
    setSaving(true);
    try {
      const { added = 0 } = await request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: entered }),
      });
      setInput("");
      notify.success(
        added === entered.length
          ? `Excluded ${added} SKU${added === 1 ? "" : "s"}.`
          : `Excluded ${added} new SKU${added === 1 ? "" : "s"} (${entered.length - added} already excluded).`,
      );
      if (added > 0) onChange();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Failed to exclude SKUs",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: StockHealthExcludedSkuDto) => {
    setRemoving(s.sku);
    try {
      await request(
        { method: "DELETE" },
        `${API}?sku=${encodeURIComponent(s.sku)}`,
      );
      notify.success(
        isRule(s.sku)
          ? `${s.sku} removed — its SKUs are counted again.`
          : s.rule
            ? `${s.sku} is counted again (an exception to ${s.rule}).`
            : `${s.sku} is counted again.`,
      );
      onChange();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Failed to remove SKU",
      );
    } finally {
      setRemoving(null);
    }
  };

  /** Counted-anyway SKU → excluded again by its rule. */
  const excludeAgain = async (sku: string) => {
    setRemoving(sku);
    try {
      await request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: [sku] }),
      });
      notify.success(`${sku} is excluded again.`);
      onChange();
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Failed to exclude SKU",
      );
    } finally {
      setRemoving(null);
    }
  };

  const rules = useMemo(
    () => (skus ?? []).filter((s) => isRule(s.sku)),
    [skus],
  );
  const countedAnyway = useMemo(
    () => (skus ?? []).filter((s) => s.countAnyway),
    [skus],
  );
  const excludedCount =
    (skus?.length ?? 0) - rules.length - countedAnyway.length;
  const shown = useMemo(() => {
    const q = filter.trim().toUpperCase();
    return (skus ?? []).filter(
      (s) => !isRule(s.sku) && !s.countAnyway && (!q || s.sku.includes(q)),
    );
  }, [skus, filter]);
  const coveredBy = (rule: string) =>
    (skus ?? []).filter((s) => s.rule === rule && !s.countAnyway).length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="max-w-4xl space-y-1.5">
          <CardTitle className="text-base">Excluded SKUs</CardTitle>
          <p className="text-xs text-muted-foreground">
            Common SKUs left out of every Stock Health table (e.g. gift
            vouchers, ERP test items). Enter the Common SKU — e.g.{" "}
            <span className="font-mono">ABC</span>, not{" "}
            <span className="font-mono">ABC_1</span>. End with{" "}
            <span className="font-mono">*</span> to exclude everything starting
            with that text, also SKUs added later — e.g.{" "}
            <span className="font-mono">BU0*</span> for bundles. Saved Monday
            snapshots are not changed.
          </p>
        </div>
        {/* The list as entered + every ERP item left out (excluded, or website draft with no stock). */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void exportExcluded()}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {exporting ? "Preparing…" : "Export excluded"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void add();
              }}
              placeholder={
                "SKUs to exclude — one per line or comma separated\nSGV1000, TEST-FAKE, BU0*"
              }
              rows={2}
              className="min-h-[60px] font-mono text-sm sm:max-w-xl"
            />
            <Button
              onClick={() => void add()}
              disabled={saving || parseSkus(input).length === 0}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Exclude
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {skus == null
              ? "Loading…"
              : [
                  `${excludedCount} excluded`,
                  rules.length
                    ? `${rules.length} rule${rules.length === 1 ? "" : "s"}`
                    : "",
                  countedAnyway.length
                    ? `${countedAnyway.length} counted anyway`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          {skus && skus.length > 10 ? (
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="h-8 w-48"
            />
          ) : null}
        </div>

        {rules.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Rules:</span>
            {rules.map((s) => (
              <Chip
                key={s.sku}
                className="border-dashed border-primary/50 bg-primary/5"
                title={`Every SKU starting with ${s.sku.slice(0, -1)} — also ones added later`}
                onRemove={canManage ? () => void remove(s) : undefined}
                removing={removing === s.sku}
                removeTitle="Remove the rule (its SKUs are counted again)"
              >
                {s.sku}
                <span className="font-sans text-muted-foreground">
                  · {coveredBy(s.sku)} SKU{coveredBy(s.sku) === 1 ? "" : "s"}
                </span>
              </Chip>
            ))}
          </div>
        ) : null}

        {skus == null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {excludedCount === 0 ? "No SKUs excluded." : "No matches."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {shown.map((s) => (
              <Chip
                key={s.sku}
                className={s.rule ? "border-primary/30" : undefined}
                title={s.rule ? `Excluded by ${s.rule}` : undefined}
                onRemove={canManage ? () => void remove(s) : undefined}
                removing={removing === s.sku}
                removeTitle={
                  s.rule
                    ? `Count it again (${s.rule} keeps excluding the rest)`
                    : "Remove from the list (count it again)"
                }
              >
                {s.sku}
              </Chip>
            ))}
          </div>
        )}

        {countedAnyway.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">
              Counted anyway (match a rule, but not excluded):
            </span>
            {countedAnyway.map((s) => (
              <Chip
                key={s.sku}
                className="border-emerald-500/40 bg-emerald-500/5"
                title={`Matches ${s.rule ?? "a rule"}, but is counted`}
                onRemove={
                  canManage ? () => void excludeAgain(s.sku) : undefined
                }
                removing={removing === s.sku}
                removeTitle={`Exclude it again (by ${s.rule ?? "its rule"})`}
              >
                {s.sku}
              </Chip>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
