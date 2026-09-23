"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListPager, usePagedRows } from "@/components/organisms/item-trends/list-pager";
import { TRAILING_COVER_DAYS } from "@/lib/item-trends/cover";
import { buildCoverCsv, downloadCsv } from "@/lib/item-trends/export";
import { resolveLocationRopQty, ropMapKey } from "@/lib/item-trends/rop-resolve";
import { childrenForCommonSku, type SkuGrain } from "@/lib/item-trends/sku-group";
import type { CoverRow } from "@/lib/item-trends/types";

type GroupedCover = CoverRow & { childCount: number };

function groupCoverByProductLocation(rows: CoverRow[]): GroupedCover[] {
  const groups = new Map<string, CoverRow[]>();
  for (const row of rows) {
    const key = `${row.commonSkuKey ?? row.sku}::${row.columnKey}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out: GroupedCover[] = [];
  for (const children of groups.values()) {
    const first = children[0];
    if (!first) continue;
    if (children.length === 1) {
      const only = children[0]!;
      const commonKey = only.commonSkuKey ?? only.sku;
      const ropMap = new Map<string, number>();
      if (only.commonRopQty != null) {
        ropMap.set(ropMapKey(commonKey, only.columnKey), only.commonRopQty);
      }
      if (only.ropQty != null) {
        ropMap.set(ropMapKey(only.sku, only.columnKey), only.ropQty);
      }
      const ropQty = resolveLocationRopQty({
        grain: "common",
        sku: commonKey,
        commonSkuKey: commonKey,
        columnKey: only.columnKey,
        ropBySkuColumn: ropMap,
        childSkus: [only.sku],
      });
      out.push({ ...only, ropQty, childCount: 1 });
      continue;
    }
    const unitsInRange = children.reduce((s, r) => s + r.unitsInRange, 0);
    const stockQty = children.reduce((s, r) => s + r.stockQty, 0);
    const weekNeed = children.reduce((s, r) => s + r.weekNeed, 0);
    const last30Units = children.reduce((s, r) => s + (r.last30Units ?? 0), 0);
    const last30AvgDaily = last30Units / TRAILING_COVER_DAYS;
    const coverDays = last30AvgDaily > 0 ? Math.round((stockQty / last30AvgDaily) * 100) / 100 : null;
    const ropMap = new Map<string, number>();
    const commonKey = first.commonSkuKey ?? first.sku;
    if (first.commonRopQty != null) {
      ropMap.set(ropMapKey(commonKey, first.columnKey), first.commonRopQty);
    }
    for (const child of children) {
      if (child.ropQty != null) {
        ropMap.set(ropMapKey(child.sku, child.columnKey), child.ropQty);
      }
      if (child.commonRopQty != null) {
        ropMap.set(ropMapKey(child.commonSkuKey ?? child.sku, child.columnKey), child.commonRopQty);
      }
    }
    const ropQty = resolveLocationRopQty({
      grain: "common",
      sku: commonKey,
      commonSkuKey: commonKey,
      columnKey: first.columnKey,
      ropBySkuColumn: ropMap,
      childSkus: children.map((c) => c.sku),
    });
    out.push({
      ...first,
      title: first.commonSkuTitle ?? first.title,
      unitsInRange,
      stockQty,
      weekNeed: Math.round(weekNeed * 100) / 100,
      last30Units,
      last30AvgDaily: Math.round(last30AvgDaily * 100) / 100,
      coverDays,
      ropQty,
      commonRopQty: first.commonRopQty ?? null,
      isOosInRange: children.some((c) => c.isOosInRange),
      childCount: children.length,
    });
  }
  return out;
}

type Props = {
  rows: CoverRow[];
  grain: SkuGrain;
  snapshotDate: string | null;
  capturedAt: string | null;
  stockSource?: "live" | "snapshot";
  loading?: boolean;
  canCapture?: boolean;
  capturing?: boolean;
  onCapture?: () => void;
  onOpenItem?: (sku: string, commonSkuKey: string | null) => void;
};

export function CoverPanel({
  rows,
  grain,
  snapshotDate,
  capturedAt,
  stockSource = "snapshot",
  loading,
  canCapture,
  capturing,
  onCapture,
  onOpenItem,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const displayRows = useMemo(() => {
    if (grain !== "common") return rows.map((r) => ({ ...r, childCount: 1 }));
    return groupCoverByProductLocation(rows);
  }, [grain, rows]);

  const fields = useCallback(
    (row: CoverRow) => [row.sku, row.title, row.brand, row.outletName, row.commonSkuTitle],
    [],
  );
  const paged = usePagedRows(displayRows, fields);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading location sales…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <p>
          {stockSource === "live" ? (
            <>
              Live ERP stock
              {capturedAt ? (
                <span className="text-muted-foreground">
                  {" "}
                  as of {new Date(capturedAt).toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
                </span>
              ) : null}
              . Night snapshot not used.
            </>
          ) : snapshotDate ? (
            <>
              Night snapshot <span className="font-medium">{snapshotDate}</span>
              {capturedAt ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({new Date(capturedAt).toLocaleString("en-LK", { timeZone: "Asia/Colombo" })})
                </span>
              ) : null}
              . Not live ERP.
            </>
          ) : (
            <span>No overnight snapshot yet. Capture now or wait for 11pm Colombo job.</span>
          )}
        </p>
        <div className="flex gap-2">
          {canCapture && onCapture ? (
            <Button type="button" size="sm" variant="outline" disabled={capturing} onClick={onCapture}>
              {capturing ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                  Capturing
                </>
              ) : (
                "Capture now"
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(`item-trends-cover.csv`, buildCoverCsv(rows))}
          >
            Export
          </Button>
        </div>
      </div>

      {paged.total === 0 ? (
        <p className="text-sm text-muted-foreground">No rows for these filters.</p>
      ) : (
        <div>
          <ListPager
            query={paged.query}
            onQueryChange={paged.setQuery}
            page={paged.page}
            pageCount={paged.pageCount}
            total={paged.total}
            from={paged.from}
            to={paged.to}
            onPage={paged.setPage}
            searchPlaceholder="Search SKU, brand, location…"
          />
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2 text-right">ROP</th>
                  <th className="px-3 py-2 text-right">Sale</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Week need</th>
                  <th className="px-3 py-2 text-right">Last 30d avg</th>
                  <th className="px-3 py-2 text-right">Cover days</th>
                  {onOpenItem ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((row) => {
                  const grouped = grain === "common";
                  const key = `${row.commonSkuKey ?? row.sku}::${row.columnKey}`;
                  const open = openKey === key;
                  const children =
                    grouped && open
                      ? childrenForCommonSku(rows, row.commonSkuKey ?? row.sku).filter(
                          (c) => c.columnKey === row.columnKey,
                        )
                      : [];
                  return (
                    <Fragment key={key}>
                      <tr className="border-t">
                        <td className="px-3 py-2">
                          {grouped && (row.childCount ?? 1) > 1 ? (
                            <button
                              type="button"
                              className="text-left font-medium underline-offset-2 hover:underline"
                              onClick={() => setOpenKey(open ? null : key)}
                            >
                              {row.commonSkuTitle ?? row.title ?? row.sku}{" "}
                              <span className="text-xs text-muted-foreground">({row.childCount} SKUs)</span>
                            </button>
                          ) : (
                            <>
                              <div className="font-medium">{row.sku}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                                {row.title}
                                {row.variantTitle ? ` · ${row.variantTitle}` : ""}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs text-muted-foreground">
                            {row.locationGroup === "cosmetics_lk"
                              ? row.channelKind === "online"
                                ? "Online"
                                : "Shop"
                              : "Company"}
                          </span>{" "}
                          {row.outletName}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.ropQty == null ? "—" : row.ropQty}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.unitsInRange}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.stockQty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.weekNeed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.last30AvgDaily ?? 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.coverDays == null ? "—" : row.coverDays}
                          {row.isOosInRange ? (
                            <span className="ml-1 text-xs text-rose-700 dark:text-rose-300">OOS</span>
                          ) : null}
                        </td>
                        {onOpenItem ? (
                          <td className="px-3 py-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onOpenItem(row.sku, row.commonSkuKey ?? null)}
                            >
                              Item
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                      {children.map((child) => (
                        <tr key={`${child.sku}-${child.columnKey}`} className="border-t bg-muted/20">
                          <td className="px-3 py-2 pl-8">
                            <div className="font-medium">{child.sku}</div>
                            <div className="text-xs text-muted-foreground">{child.variantTitle ?? child.title}</div>
                          </td>
                          <td className="px-3 py-2">{child.outletName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {child.ropQty == null ? "—" : child.ropQty}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{child.unitsInRange}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{child.stockQty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{child.weekNeed}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{child.last30AvgDaily ?? 0}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {child.coverDays == null ? "—" : child.coverDays}
                          </td>
                          {onOpenItem ? (
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onOpenItem(child.sku, child.commonSkuKey ?? null)}
                              >
                                Item
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
