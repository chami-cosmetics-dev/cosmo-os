import type { ShopRequestLineView } from "@/lib/material-transfer/shop-item-request";
import { cn } from "@/lib/utils";

export function ShopRequestLines({ lines }: { lines: ShopRequestLineView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-1 pr-3">Item</th>
            <th className="py-1 pr-3">Qty</th>
            <th className="py-1 pr-3">Shops</th>
            {lines[0]?.stocks.map((stock) => (
              <th key={stock.key} className="py-1 pr-3">
                {stock.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.itemCode} className="border-t">
              <td className="py-1 pr-3">
                <div>{line.itemCode}</div>
                <div className="text-muted-foreground">{line.itemName}</div>
                {line.barcode ? <div className="text-muted-foreground">{line.barcode}</div> : null}
              </td>
              <td className="py-1 pr-3">{line.neededQty}</td>
              <td className="py-1 pr-3">
                {line.shopAvailability === "not_allowed"
                  ? "Not allowed"
                  : line.shopAvailability === "allowed"
                    ? "Allowed"
                    : "—"}
              </td>
              {line.stocks.map((stock) => (
                <td
                  key={stock.key}
                  className={cn(
                    "py-1 pr-3",
                    stock.cannotTransfer && "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
                  )}
                >
                  {stock.qty == null ? "Unknown" : stock.qty}
                  {stock.cannotTransfer ? <div className="text-xs font-medium">Cannot transfer</div> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
