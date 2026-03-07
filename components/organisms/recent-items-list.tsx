import { Clock3, Package2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Item {
  id: string;
  name: string;
  createdAt?: string;
}

interface RecentItemsListProps {
  items: Item[];
}

export function RecentItemsList({ items }: RecentItemsListProps) {
  return (
    <Card className="border-border/60 bg-card/90 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle>Recently Updated Items</CardTitle>
        <p className="text-sm text-muted-foreground">
          The latest product records touched in the selected view.
        </p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Package2 className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No recent item activity</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Product updates will appear here once items are edited.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border bg-background/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Item updated in catalog</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  <span>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Date unavailable"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
