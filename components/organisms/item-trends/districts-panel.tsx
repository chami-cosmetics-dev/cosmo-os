"use client";

import type { DistrictDemandRow, ItemMovementRow } from "@/lib/item-trends/types";
import { MovementTable } from "@/components/organisms/item-trends/movement-table";
import { ExpansionPanel } from "@/components/organisms/item-trends/expansion-panel";

type Props = {
  districts: DistrictDemandRow[];
  items: ItemMovementRow[];
  selectedDistrict: string | null;
  onSelectDistrict: (district: string | null) => void;
  loading: boolean;
};

function growthBadge(status: DistrictDemandRow["growthStatus"]) {
  const styles: Record<DistrictDemandRow["growthStatus"], string> = {
    growing: "bg-emerald-100 text-emerald-800",
    stable: "bg-slate-100 text-slate-700",
    declining: "bg-red-100 text-red-800",
    emerging: "bg-sky-100 text-sky-800",
    expansion_candidate: "bg-amber-100 text-amber-800",
  };
  const labels: Record<DistrictDemandRow["growthStatus"], string> = {
    growing: "Growing",
    stable: "Stable",
    declining: "Declining",
    emerging: "Emerging",
    expansion_candidate: "Expansion",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function DistrictsPanel({
  districts,
  items,
  selectedDistrict,
  onSelectDistrict,
  loading,
}: Props) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading districts…</p>;
  }

  if (districts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No district demand in this range.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold">District leaderboard</h3>
        <div className="max-h-[420px] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-left backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">District</th>
                <th className="px-3 py-2 font-medium text-right">Units</th>
                <th className="px-3 py-2 font-medium text-right">Share</th>
                <th className="px-3 py-2 font-medium text-right">vs prior</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {districts.map((row) => (
                <tr
                  key={row.district}
                  className={`border-t cursor-pointer hover:bg-muted/40 ${
                    selectedDistrict === row.district ? "bg-muted/60" : ""
                  }`}
                  onClick={() =>
                    onSelectDistrict(selectedDistrict === row.district ? null : row.district)
                  }
                >
                  <td className="px-3 py-2 font-medium">{row.district}</td>
                  <td className="px-3 py-2 text-right">{row.units}</td>
                  <td className="px-3 py-2 text-right">{row.sharePct}%</td>
                  <td className="px-3 py-2 text-right">
                    {row.changePct != null ? `${row.changePct > 0 ? "+" : ""}${row.changePct}%` : "—"}
                  </td>
                  <td className="px-3 py-2">{growthBadge(row.growthStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Click a district to drill into local fast movers. Unmapped = shipping address could not be
          resolved to a Sri Lanka district.
        </p>
      </div>

      {selectedDistrict ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Fast movers in {selectedDistrict}</h3>
          <MovementTable rows={items} />
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Area growth (all districts)</h3>
        <div className="flex flex-wrap gap-2">
          {districts
            .filter((row) => row.district !== "Unmapped")
            .map((row) => (
            <button
              key={`growth-${row.district}`}
              type="button"
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted/50"
              onClick={() => onSelectDistrict(row.district)}
            >
              {row.district} {growthBadge(row.growthStatus)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DistrictsTabContent({
  districts,
  items,
  expansion,
  selectedDistrict,
  onSelectDistrict,
  loading,
}: Props & { expansion: import("@/lib/item-trends/types").ExpansionOpportunityRow[] }) {
  return (
    <div className="space-y-6">
      <DistrictsPanel
        districts={districts}
        items={items}
        selectedDistrict={selectedDistrict}
        onSelectDistrict={onSelectDistrict}
        loading={loading}
      />
      <ExpansionPanel rows={expansion} />
    </div>
  );
}
