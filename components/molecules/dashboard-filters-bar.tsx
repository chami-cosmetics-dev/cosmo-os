import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface DashboardFiltersBarProps {
  fromDate: string;
  toDate: string;
  dateType: "order" | "completed";
  analysisType: "merchant" | "payment_gateway";
  summary: string;
}

export function DashboardFiltersBar({
  fromDate,
  toDate,
  dateType,
  analysisType,
  summary,
}: DashboardFiltersBarProps) {
  return (
    <Card className="border-border/70 bg-card/95 py-0 shadow-sm">
      <CardContent className="px-4 py-5">
        <form method="get" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Date range</legend>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <Input
                  id="dashboard-from"
                  name="from"
                  type="date"
                  defaultValue={fromDate}
                  className="h-10"
                  aria-label="From date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  id="dashboard-to"
                  name="to"
                  type="date"
                  defaultValue={toDate}
                  className="h-10"
                  aria-label="To date"
                />
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Date type</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="dateType"
                    value="order"
                    defaultChecked={dateType === "order"}
                    className="peer sr-only"
                  />
                  <span className="flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors peer-checked:border-sky-700 peer-checked:bg-sky-800 peer-checked:text-white">
                    Order Date
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="dateType"
                    value="completed"
                    defaultChecked={dateType === "completed"}
                    className="peer sr-only"
                  />
                  <span className="flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors peer-checked:border-sky-700 peer-checked:bg-sky-800 peer-checked:text-white">
                    Completed Date
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Analysis</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="analysisType"
                    value="merchant"
                    defaultChecked={analysisType === "merchant"}
                    className="peer sr-only"
                  />
                  <span className="flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors peer-checked:border-sky-700 peer-checked:bg-sky-800 peer-checked:text-white">
                    Merchant
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="analysisType"
                    value="payment_gateway"
                    defaultChecked={analysisType === "payment_gateway"}
                    className="peer sr-only"
                  />
                  <span className="flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors peer-checked:border-sky-700 peer-checked:bg-sky-800 peer-checked:text-white">
                    Payment Source
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="grid gap-2 xl:grid-cols-1">
              <Button
                type="submit"
                className="h-10 w-full bg-sky-800 text-white hover:bg-sky-700 xl:w-auto xl:px-6"
              >
                Apply
              </Button>
              <Button
                type="submit"
                name="preset"
                value="today"
                variant="outline"
                className="h-10 w-full xl:w-auto"
              >
                Today
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="preset" value="last_7_days" variant="outline" size="sm">
              Last 7 days
            </Button>
            <Button type="submit" name="preset" value="last_30_days" variant="outline" size="sm">
              Last 30 days
            </Button>
            <Button type="submit" name="preset" value="this_month" variant="outline" size="sm">
              This month
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{summary}</p>
        </form>
      </CardContent>
    </Card>
  );
}
