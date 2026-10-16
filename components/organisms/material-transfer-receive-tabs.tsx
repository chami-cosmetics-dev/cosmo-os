"use client";

import { MaterialTransferReceivePanel } from "@/components/organisms/material-transfer-receive-panel";
import { MaterialTransferRequestPanel } from "@/components/organisms/material-transfer-request-panel";
import { MaterialTransferReturnPanel } from "@/components/organisms/material-transfer-return-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function MaterialTransferReceiveTabs({ canReturn }: { canReturn: boolean }) {
  return (
    <Tabs defaultValue="receive">
      <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
        <TabsTrigger value="request">Request items</TabsTrigger>
        <TabsTrigger value="receive">Receive</TabsTrigger>
        {canReturn ? <TabsTrigger value="return">Return to main</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="request">
        <MaterialTransferRequestPanel />
      </TabsContent>
      <TabsContent value="receive">
        <MaterialTransferReceivePanel />
      </TabsContent>
      {canReturn ? (
        <TabsContent value="return">
          <MaterialTransferReturnPanel />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
