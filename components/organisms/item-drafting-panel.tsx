"use client";

import { useCallback, useEffect, useState } from "react";
import { PackageX } from "lucide-react";

import { DumpDownloadButton } from "@/components/molecules/dump-download-button";
import { ItemDraftingActiveAgainSettings } from "@/components/organisms/item-drafting-active-again-settings";
import { ItemDraftingDashboard } from "@/components/organisms/item-drafting-dashboard";
import type { DashboardTarget } from "@/components/organisms/item-drafting-dashboard-charts";
import { ItemDraftingPurchasingApproval } from "@/components/organisms/item-drafting-purchasing-approval";
import { ItemDraftingShopifyDraft } from "@/components/organisms/item-drafting-shopify-draft";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ShopifyDraftGroup } from "@/lib/discontinued-items/dashboard-summary";
import {
  ITEM_DRAFTING_TAB_LABELS,
  visibleItemDraftingTabs,
  type ItemDraftingAccess,
  type ItemDraftingTab,
} from "@/lib/discontinued-items/config";

/** Window event the reminder bubbles (SLA HUD) listen to, to reload straight away. */
export const TASK_REMINDERS_REFRESH_EVENT = "task-reminders:refresh";

type Counts = { pending: number; shopifyDraft: number };

export function ItemDraftingPanel({
  initialTab,
  ...access
}: ItemDraftingAccess & { initialTab?: string | null }) {
  const tabs = visibleItemDraftingTabs(access);
  const [tab, setTab] = useState<ItemDraftingTab>(
    tabs.find((t) => t === initialTab) ?? tabs[0] ?? "dashboard",
  );
  const [counts, setCounts] = useState<Counts | null>(null);

  // Bumped after a click so the badges re-read the saved status.
  const [countsKey, setCountsKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/discontinued-items/counts", { cache: "no-store" });
        if (res.ok && active) setCounts((await res.json()) as Counts);
      } catch {
        // Badges are a convenience; the tabs still work without them.
      }
    })();
    return () => {
      active = false;
    };
  }, [countsKey]);

  const loadCounts = useCallback(() => setCountsKey((k) => k + 1), []);

  /** After a button click: tab badges and the SLA HUD bubbles update straight away. */
  const onItemsChanged = useCallback(() => {
    loadCounts();
    window.dispatchEvent(new Event(TASK_REMINDERS_REFRESH_EVENT));
  }, [loadCounts]);

  // Dashboard count card / doughnut clicks: open the tab filtered to that group.
  const [purchasingRequest, setPurchasingRequest] = useState<
    { filter: "waiting" | "pending"; nonce: number } | undefined
  >();
  const [draftRequest, setDraftRequest] = useState<
    { group: ShopifyDraftGroup; nonce: number } | undefined
  >();
  const openTarget = (target: DashboardTarget) => {
    if (!tabs.includes(target.tab)) return; // no access to that tab
    if (target.tab === "purchasing_approval") {
      setPurchasingRequest((prev) => ({ filter: target.filter, nonce: (prev?.nonce ?? 0) + 1 }));
    } else {
      setDraftRequest((prev) => ({ group: target.group, nonce: (prev?.nonce ?? 0) + 1 }));
    }
    setTab(target.tab);
  };

  const badgeFor = (t: ItemDraftingTab) => {
    if (!counts) return 0;
    if (t === "purchasing_approval") return counts.pending;
    if (t === "shopify_draft") return counts.shopifyDraft;
    return 0;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <PackageX className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Item Drafting</h1>
          <p className="text-sm text-muted-foreground">
            Discontinued items: purchasing approval and Shopify drafting.
          </p>
        </div>
        {access.isManager && (
          // Manager-only: weekly "active again" mail schedule + full item history download.
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ItemDraftingActiveAgainSettings />
            {/* Shows "Preparing…" while the file is built, then the download %, with a bar. */}
            <DumpDownloadButton
              href="/api/admin/discontinued-items/export"
              label="Download history"
              variant="outline"
            />
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as ItemDraftingTab)}>
        <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
          {tabs.map((t) => {
            const badge = badgeFor(t);
            return (
              <TabsTrigger key={t} value={t} className="gap-2">
                {ITEM_DRAFTING_TAB_LABELS[t]}
                {badge > 0 && (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold leading-5 text-white"
                    aria-label={`${badge} ${t === "purchasing_approval" ? "pending" : "to draft"}`}
                  >
                    {badge}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {tabs.map((t) => (
          // forceMount keeps every tab loaded (hidden when inactive), so switching tabs keeps each
          // tab's data, filters and scroll instead of reloading from the ERP.
          <TabsContent key={t} value={t} forceMount className="mt-4 data-[state=inactive]:hidden">
            {t === "dashboard" ? (
              <ItemDraftingDashboard reloadKey={countsKey} onRefreshed={onItemsChanged} onOpen={openTarget} />
            ) : t === "purchasing_approval" ? (
              <ItemDraftingPurchasingApproval
                canAct={access.canActPurchasingApproval}
                canResetTest={access.canActPurchasingApproval || access.isManager}
                reloadKey={countsKey}
                onItemsChanged={onItemsChanged}
                filterRequest={purchasingRequest}
              />
            ) : (
              <ItemDraftingShopifyDraft
                canAct={access.canActShopifyDraft}
                canRecheck={access.canActShopifyDraft || access.isManager}
                reloadKey={countsKey}
                onItemsChanged={onItemsChanged}
                draftFilterRequest={draftRequest}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
