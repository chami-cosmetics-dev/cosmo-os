"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailySalesSmsLogsPanel } from "@/components/organisms/daily-sales-sms-logs-panel";
import { OgfEmailLogsPanel } from "@/components/organisms/ogf-email-logs-panel";
import type {
  DailySalesSmsLogDto,
  NightlyLogsPagination,
  OgfEmailLogDto,
} from "@/lib/nightly-logs";

type Props = {
  ogfConfigured: boolean;
  ogfLogs: OgfEmailLogDto[];
  ogfPagination: NightlyLogsPagination;
  smsLogs: DailySalesSmsLogDto[];
  smsPagination: NightlyLogsPagination;
};

export function OgfLogsPageClient({
  ogfConfigured,
  ogfLogs,
  ogfPagination,
  smsLogs,
  smsPagination,
}: Props) {
  return (
    <Tabs defaultValue="ogf" className="gap-5">
      <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
        <TabsTrigger value="ogf" className="px-3 py-1.5">
          OGF email
          <span className="ml-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {ogfPagination.total}
          </span>
        </TabsTrigger>
        <TabsTrigger value="sms" className="px-3 py-1.5">
          Daily sales SMS
          <span className="ml-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {smsPagination.total}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ogf" className="mt-0 outline-none">
        <OgfEmailLogsPanel
          initialLogs={ogfLogs}
          initialPagination={ogfPagination}
          ogfConfigured={ogfConfigured}
        />
      </TabsContent>

      <TabsContent value="sms" className="mt-0 outline-none">
        <DailySalesSmsLogsPanel
          initialLogs={smsLogs}
          initialPagination={smsPagination}
          showSendForDate
        />
      </TabsContent>
    </Tabs>
  );
}
