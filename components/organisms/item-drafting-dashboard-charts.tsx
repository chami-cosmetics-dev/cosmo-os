"use client";

import { Donut, type Segment } from "@/components/organisms/stock-health-dashboard";
import { formatNumber } from "@/components/organisms/sales-budget-table-ui";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ItemDraftingSummary, ShopifyDraftGroup } from "@/lib/discontinued-items/dashboard-summary";
import { cn } from "@/lib/utils";

/** Where a click goes: Purchasing Approval (status filter) or Shopify Draft (Draft column filter). */
export type DashboardTarget =
  | { tab: "purchasing_approval"; filter: "waiting" | "pending" }
  | { tab: "shopify_draft"; group: ShopifyDraftGroup };

const COLORS = {
  yellow: "#f6d98b",
  // Two yellows in the Shopify Draft doughnut, told apart: deeper (Awaiting Draft) and paler (Awaiting Check).
  yellowDeep: "#e9b949",
  yellowPale: "#fbecb8",
  orange: "#f8b47a",
  green: "#9fdcbf",
  grey: "#cbd5e1",
  red: "#f4a3b1",
  violet: "#c4b5fd",
};

type LegendSegment = Segment & { explanation: string; target?: DashboardTarget };

const CARD_CLASS =
  "gap-0 overflow-visible py-0 rounded-2xl border border-border/70 bg-card shadow-xs";
const CARD_HEAD_CLASS =
  "space-y-1 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_90%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] pt-3 pb-3 text-center [.border-b]:pb-3";
const CARD_BODY_CLASS =
  "bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--secondary)_6%,transparent))] pt-3 pb-3";

function DoughnutCard({
  id,
  title,
  subtitle,
  centreLabel,
  segments,
  onOpen,
}: {
  id: string;
  title: string;
  subtitle: string;
  centreLabel: string;
  segments: LegendSegment[];
  onOpen: (target: DashboardTarget) => void;
}) {
  const byKey = new Map(segments.map((s) => [s.key, s]));
  return (
    <Card className={CARD_CLASS}>
      <CardHeader className={CARD_HEAD_CLASS}>
        <p className="text-base leading-6 font-semibold tracking-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className={CARD_BODY_CLASS}>
        <Donut
          id={id}
          segments={segments}
          centreLabel={centreLabel}
          onSegmentClick={(key) => {
            const target = byKey.get(key)?.target;
            if (target) onOpen(target);
          }}
        />
        <ul className="mt-2 space-y-1">
          {segments.map((s) => {
            const body = (
              <>
                <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.fill }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-sm font-semibold tabular-nums" title={s.hint}>
                      {formatNumber(s.value)}
                    </span>
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {s.explanation}
                    {s.hint ? ` · ${s.hint}` : ""}
                  </span>
                </span>
              </>
            );
            return (
              <li key={s.key}>
                {s.target ? (
                  <button
                    type="button"
                    onClick={() => onOpen(s.target!)}
                    title={`Open ${s.target.tab === "purchasing_approval" ? "Purchasing Approval" : "Shopify Draft"}: ${s.label}`}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-2 px-2 py-1" title="History only">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Item Drafting → Dashboard: count cards + three doughnuts (Purchasing → Shopify Draft → After
 * Drafting). Every item is in exactly one segment per doughnut (see dashboard-summary). Read-only.
 */
export function ItemDraftingDashboardCharts({
  summary,
  onOpen,
}: {
  summary: ItemDraftingSummary;
  onOpen: (target: DashboardTarget) => void;
}) {
  if (summary.total === 0) {
    return (
      <Card className={CARD_CLASS}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No discontinued items yet. Items appear here once a variant SKU has Product Priority
          “Discontinue” and 0 stock.
        </CardContent>
      </Card>
    );
  }

  const pendingSplit = `ERP 1 left: ${formatNumber(summary.pendingErp1Left)}, ERP 2 left: ${formatNumber(summary.pendingErp2Left)}`;
  const purchasing: LegendSegment[] = [
    {
      key: "waiting",
      label: "Waiting",
      value: summary.purchasing.waiting,
      fill: COLORS.yellow,
      explanation: "Not disabled in any ERP yet",
      target: { tab: "purchasing_approval", filter: "waiting" },
    },
    {
      key: "pending",
      label: "Pending",
      value: summary.purchasing.pending,
      fill: COLORS.orange,
      explanation: "In both ERPs and only one is done",
      hint: summary.purchasing.pending > 0 ? pendingSplit : undefined,
      target: { tab: "purchasing_approval", filter: "pending" },
    },
    {
      key: "approved",
      label: "Approved",
      value: summary.purchasing.approved,
      fill: COLORS.green,
      explanation: "All ERPs done, item goes to SEO",
    },
    {
      key: "notOnWebsite",
      label: "Not on Website",
      value: summary.purchasing.notOnWebsite,
      fill: COLORS.grey,
      explanation: "Only in ERP 2 and disabled, nothing for SEO to do",
    },
  ];
  const shopify: LegendSegment[] = [
    {
      key: "awaitingDraft",
      label: "Awaiting Draft",
      value: summary.shopify.awaitingDraft,
      fill: COLORS.yellowDeep,
      explanation: "Approved, Draft button not clicked yet",
      target: { tab: "shopify_draft", group: "awaitingDraft" },
    },
    {
      key: "awaitingCheck",
      label: "Awaiting Check",
      value: summary.shopify.awaitingCheck,
      fill: COLORS.yellowPale,
      explanation: "Draft clicked, the 5:30 PM check is not done yet",
      hint: summary.checkFailed > 0 ? `${formatNumber(summary.checkFailed)} check failed, retrying` : undefined,
      target: { tab: "shopify_draft", group: "awaitingCheck" },
    },
    {
      key: "mismatch",
      label: "Mismatch",
      value: summary.shopify.mismatch,
      fill: COLORS.red,
      explanation: "Marked Drafted but still active in Shopify",
      target: { tab: "shopify_draft", group: "mismatch" },
    },
    {
      key: "completed",
      label: "Completed",
      value: summary.shopify.completed,
      fill: COLORS.green,
      explanation: "Verified as drafted",
    },
    {
      key: "alreadyDraft",
      label: "Already drafted in Shopify",
      value: summary.shopify.alreadyDraft,
      fill: COLORS.violet,
      explanation: "Already Draft in Shopify when approved, completed by the system",
    },
  ];
  const after: LegendSegment[] = [
    {
      key: "stillDrafted",
      label: "Still Drafted",
      value: summary.after.stillDrafted,
      fill: COLORS.green,
      explanation: "Drafted items that are still drafted",
    },
    {
      key: "activeAgain",
      label: "Active Again",
      value: summary.after.activeAgain,
      fill: COLORS.red,
      explanation: "Drafted items that became active again",
    },
  ];

  const countCards: Array<{ label: string; value: number; fill: string; target?: DashboardTarget; hint?: string }> = [
    { label: "Waiting", value: summary.purchasing.waiting, fill: COLORS.yellow, target: purchasing[0].target },
    { label: "Pending", value: summary.purchasing.pending, fill: COLORS.orange, target: purchasing[1].target, hint: purchasing[1].hint },
    { label: "Awaiting Draft", value: summary.shopify.awaitingDraft, fill: COLORS.yellowDeep, target: shopify[0].target },
    { label: "Mismatch", value: summary.shopify.mismatch, fill: COLORS.red, target: shopify[2].target },
    { label: "Completed", value: summary.shopify.completed, fill: COLORS.green },
    { label: "Already drafted in Shopify", value: summary.shopify.alreadyDraft, fill: COLORS.violet },
    { label: "Active Again", value: summary.after.activeAgain, fill: COLORS.red },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {countCards.map((c) => {
          const inner = (
            <>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: c.fill }} aria-hidden />
                {c.label}
              </span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums">{formatNumber(c.value)}</span>
            </>
          );
          const base = "rounded-2xl border border-border/70 bg-card px-4 py-3 text-left shadow-xs";
          return c.target ? (
            <button
              key={c.label}
              type="button"
              onClick={() => onOpen(c.target!)}
              title={c.hint ? `${c.label}: ${c.value} (${c.hint})` : `Open ${c.label}`}
              className={cn(base, "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md")}
            >
              {inner}
            </button>
          ) : (
            <div key={c.label} className={base} title="History only">
              {inner}
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <DoughnutCard
          id="item-drafting-donut-purchasing"
          title="Purchasing"
          subtitle="Every discontinued item, by ERP disabling."
          centreLabel="Items"
          segments={purchasing}
          onOpen={onOpen}
        />
        <DoughnutCard
          id="item-drafting-donut-shopify"
          title="Shopify Draft"
          subtitle="Approved items on the website."
          centreLabel="Approved"
          segments={shopify}
          onOpen={onOpen}
        />
        <DoughnutCard
          id="item-drafting-donut-after"
          title="After Drafting"
          subtitle="Completed + already drafted items, checked weekly."
          centreLabel="Drafted"
          segments={after}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}
