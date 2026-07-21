"use client";

type SourceRow = { column: string; source: string; note: string };

const ROWS: SourceRow[] = [
  { column: "Identity (SKU, description, brand, barcode, image, status)", source: "Cosmo", note: "Product catalog" },
  { column: "Shop Availability", source: "Cosmo UI", note: "Edited on this page" },
  { column: "Stock locations", source: "ERP", note: "Bin actual_qty via location warehouses" },
  { column: "ROP / Common ROP", source: "Cosmo UI", note: "Edited on this page — not ERP" },
  { column: "% / 70% / Order qty", source: "Calc", note: "From stock + ROP" },
  { column: "MRP / Discounted", source: "Cosmo", note: "Compare-at / sell price" },
  { column: "OGF Price", source: "Cosmo UI", note: "Independent — not LWK" },
  { column: "Latest Cost / Supplier", source: "ERP", note: "Blank if missing — never invented" },
  { column: "Cosmetics / OGF Margin", source: "Calc", note: "(original sell − cost) / original sell — per-user column access" },
  { column: "Monthly sales units", source: "Cosmo", note: "delivery/invoice complete, Colombo month" },
];

export function OsfFieldSourceLegend() {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-sm">
      <h3 className="mb-2 font-medium">Field sources</h3>
      <p className="mb-3 text-muted-foreground">
        Where each OSF column group comes from when you generate the workbook.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Column group</th>
              <th className="py-1.5 pr-3 font-medium">Source</th>
              <th className="py-1.5 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.column} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-3 align-top">{row.column}</td>
                <td className="py-1.5 pr-3 align-top font-medium">{row.source}</td>
                <td className="py-1.5 align-top text-muted-foreground">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
