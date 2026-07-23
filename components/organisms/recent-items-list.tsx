import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAppDate } from "@/lib/format-datetime";

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
    <Card>
      <CardHeader>
        <CardTitle>Recent Items</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No items yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <span className="font-medium">{item.name}</span>
                {item.createdAt && (
                  <span className="text-muted-foreground text-xs">
                    {formatAppDate(item.createdAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
