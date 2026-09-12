"use client";

import { Input } from "@/components/ui/input";
import type { ItemTrendFilterLocation } from "@/lib/item-trends/types";
import type { ErpStockScope } from "@/lib/item-trends/erp-scope";
import type { SkuGrain } from "@/lib/item-trends/sku-group";

type Props = {
  brands: string[];
  brand: string;
  onBrandChange: (value: string) => void;
  grain?: SkuGrain;
  onGrainChange?: (value: SkuGrain) => void;
  locations?: ItemTrendFilterLocation[];
  selectedColumnKeys?: string[];
  onColumnKeysChange?: (keys: string[]) => void;
  erpScope?: ErpStockScope;
  erpScopes?: Array<{ value: ErpStockScope; label: string }>;
  onErpScopeChange?: (value: ErpStockScope) => void;
  oosOnly?: boolean;
  onOosOnlyChange?: (value: boolean) => void;
  sendOnly?: boolean;
  onSendOnlyChange?: (value: boolean) => void;
  sku?: string;
  onSkuChange?: (value: string) => void;
};

export function ItemTrendsSectionFilters({
  brands,
  brand,
  onBrandChange,
  grain,
  onGrainChange,
  locations,
  selectedColumnKeys,
  onColumnKeysChange,
  erpScope,
  erpScopes,
  onErpScopeChange,
  oosOnly,
  onOosOnlyChange,
  sendOnly,
  onSendOnlyChange,
  sku,
  onSkuChange,
}: Props) {
  const allSelected = !selectedColumnKeys || selectedColumnKeys.length === 0;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 p-3">
      {onErpScopeChange && erpScopes && erpScopes.length > 1 ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">ERP stock</label>
          <select
            className="flex h-9 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
            value={erpScope ?? "both"}
            onChange={(e) => onErpScopeChange(e.target.value as ErpStockScope)}
          >
            {erpScopes.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Brand</label>
        <select
          className="flex h-9 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
          value={brand}
          onChange={(e) => onBrandChange(e.target.value)}
        >
          <option value="">All brands</option>
          {brands.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {onGrainChange && grain ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">SKU grain</label>
          <select
            className="flex h-9 min-w-[150px] rounded-md border border-input bg-background px-3 text-sm"
            value={grain}
            onChange={(e) => onGrainChange(e.target.value as SkuGrain)}
          >
            <option value="common">Common SKU</option>
            <option value="variant">Variant SKU</option>
          </select>
        </div>
      ) : null}
      {onSkuChange ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">SKU</label>
          <Input
            value={sku ?? ""}
            onChange={(e) => onSkuChange(e.target.value)}
            placeholder="ORD04 or ORD04_1"
            className="h-9 w-[140px]"
          />
        </div>
      ) : null}
      {locations && onColumnKeysChange ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Location</label>
          <select
            className="flex h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
            value={allSelected ? "" : selectedColumnKeys?.[0] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onColumnKeysChange(v ? [v] : []);
            }}
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.columnKey} value={loc.columnKey}>
                {loc.locationGroup === "cosmetics_lk"
                  ? loc.channelKind === "online"
                    ? "Online · "
                    : "Shop · "
                  : "Company · "}
                {loc.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {onOosOnlyChange ? (
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(oosOnly)}
            onChange={(e) => onOosOnlyChange(e.target.checked)}
          />
          OOS in range
        </label>
      ) : null}
      {onSendOnlyChange ? (
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(sendOnly)}
            onChange={(e) => onSendOnlyChange(e.target.checked)}
          />
          Send list (below 50%)
        </label>
      ) : null}
    </div>
  );
}
