"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { OrderAvailabilityPriorityEditor } from "@/components/organisms/order-availability-priority-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatAppTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { buildDetail, normalizeRequestLines, parseSkuPaste } from "@/lib/order-availability/rank";
import {
  MAX_DISTINCT_SKUS,
  MAX_LINE_QTY,
  type CapStatus,
  type CompanyResult,
  type NoOptionReason,
  type OrderAvailabilityResponse,
} from "@/lib/order-availability/types";
import { cn } from "@/lib/utils";

type EntryRow = { id: number; sku: string; qty: string };

const lkr = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 });

function money(value: number | null): string {
  return value == null ? "—" : `LKR ${lkr.format(value)}`;
}

function Pill({ tone = "muted", children }: { tone?: "muted" | "primary" | "warn" | "danger" | "ok"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "primary" && "border-primary bg-primary text-primary-foreground",
        tone === "warn" && "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "danger" && "border-destructive/40 bg-destructive/15 text-destructive",
        tone === "ok" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {children}
    </span>
  );
}

const CAP_LABEL: Partial<Record<CapStatus, { text: string; tone: "warn" | "danger" | "muted" }>> = {
  near: { text: "Near cap", tone: "warn" },
  would_exceed: { text: "Would exceed cap", tone: "danger" },
  reached: { text: "Cap reached", tone: "danger" },
  unknown: { text: "Cap unknown", tone: "muted" },
};

function noOptionText(reason: NoOptionReason, limit: number): string {
  switch (reason) {
    case "all_over_cap":
      return `Every company that holds these items would go over its ${money(limit)} monthly cap with this order.`;
    case "cap_unavailable":
      return "Could not read this month's sales, so the cap cannot be checked. No company is suggested.";
    case "no_coverage":
      return "No company's main warehouse holds enough of any of these SKUs.";
    case "no_found_skus":
      return "None of these SKUs were found in ERP2.";
  }
}

function CapBar({ company, limit }: { company: CompanyResult; limit: number }) {
  const cap = company.cap;
  if (!cap || cap.usedMtd == null) return null;
  const used = Math.min(100, (cap.usedMtd / limit) * 100);
  const withOrder = Math.min(100, ((cap.usedMtd + cap.orderValue) / limit) * 100);
  return (
    <div className="space-y-1 text-xs">
      <div className="bg-muted relative h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            "absolute inset-y-0 left-0",
            cap.status === "ok" ? "bg-emerald-500/40" : cap.status === "near" ? "bg-amber-500/50" : "bg-destructive/50",
          )}
          style={{ width: `${withOrder}%` }}
        />
        <div className="bg-foreground/50 absolute inset-y-0 left-0" style={{ width: `${used}%` }} />
      </div>
      <div className="text-muted-foreground flex flex-wrap justify-between gap-x-3">
        <span>Used this month {money(cap.usedMtd)}</span>
        <span>After order {money(cap.headroomAfter)} left</span>
      </div>
    </div>
  );
}

function SkuList({ label, items, tone }: { label: string; items: string[]; tone: "ok" | "warn" | "danger" }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground w-16 shrink-0 text-xs">{label}</span>
      {items.map((item) => (
        <Pill key={item} tone={tone}>
          {item}
        </Pill>
      ))}
    </div>
  );
}

function CompanyCard({
  company,
  result,
  selected,
  onSelect,
}: {
  company: CompanyResult;
  result: OrderAvailabilityResponse;
  selected: boolean;
  onSelect: () => void;
}) {
  const found = result.lines.filter((line) => line.found);
  const byStatus = (status: "covered" | "short" | "missing") =>
    found
      .filter((line) => company.lines[line.key]?.status === status)
      .map((line) =>
        status === "short" ? `${line.sku} (${company.lines[line.key].available} of ${line.qty})` : line.sku,
      );
  const capLabel = company.cap ? CAP_LABEL[company.cap.status] : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "bg-card w-full rounded-xl border p-4 text-left transition-colors hover:bg-accent/40",
        selected && "ring-primary ring-2",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {company.option ? <Pill tone="primary">Option {company.option}</Pill> : null}
        <span className="min-w-0 font-medium break-words">{company.company}</span>
        <Pill>
          {company.coveredCount} of {found.length}
        </Pill>
        {company.fullCoverage ? <Pill tone="ok">Full coverage</Pill> : null}
        {company.warehousePriority ? <Pill tone="primary">Priority {company.warehousePriority}</Pill> : null}
        {company.capExempt ? <Pill tone="ok">Cap waived</Pill> : null}
        {capLabel ? <Pill tone={capLabel.tone}>{capLabel.text}</Pill> : null}
        {selected ? <Pill tone="primary">Selected</Pill> : null}
      </div>
      <p className="text-muted-foreground mt-1 text-xs break-words">{company.warehouses.join(" · ")}</p>
      <div className="mt-3 space-y-1.5">
        <SkuList label="Covered" items={byStatus("covered")} tone="ok" />
        <SkuList label="Short" items={byStatus("short")} tone="warn" />
        <SkuList label="Missing" items={byStatus("missing")} tone="danger" />
      </div>
      <div className="mt-3">
        <CapBar company={company} limit={result.cap.limit} />
      </div>
    </button>
  );
}

function DetailCard({ result, company }: { result: OrderAvailabilityResponse; company: string }) {
  const detail = useMemo(() => buildDetail(result, company), [result, company]);
  if (!detail) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Place the order under {detail.company}</CardTitle>
        <CardDescription>
          Items already in its main warehouses, and where to bring the rest from.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section className="space-y-2">
          <h3 className="font-medium">Already in {detail.company}</h3>
          {detail.covered.length === 0 ? (
            <p className="text-muted-foreground">None of the items are fully available here.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {detail.covered.map((line) => (
                <li key={line.key} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="font-medium">
                    {line.sku} <span className="text-muted-foreground font-normal">× {line.qty}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {line.byWarehouse.map((row) => `${row.warehouse}: ${row.available}`).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {detail.toMove.length > 0 ? (
          <section className="space-y-2">
            <h3 className="font-medium">Move to {detail.company}</h3>
            <ul className="space-y-3">
              {detail.toMove.map((line) => (
                <li key={line.key} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{line.sku}</span>
                    <span className="text-muted-foreground">
                      need {line.qty}, here {line.ownAvailable}
                    </span>
                    {!line.availableAnywhere ? <Pill tone="danger">Not available anywhere</Pill> : null}
                  </div>
                  {line.sources.length > 0 ? (
                    <ul className="text-muted-foreground mt-2 space-y-1">
                      {line.sources.map((source) => (
                        <li key={`${source.company}::${source.warehouse}`} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5 break-words">
                            {source.company} · {source.warehouse}
                            {source.priority ? <Pill tone="primary">Priority {source.priority}</Pill> : null}
                          </span>
                          <span className="text-foreground font-medium">{source.available}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Raise transfers through Material Transfer. This tab does not move stock.
        </p>
      </CardContent>
    </Card>
  );
}

export function OrderAvailabilityPanel({ canManage }: { canManage: boolean }) {
  const [paste, setPaste] = useState("");
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OrderAvailabilityResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const nextId = useRef(1);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  function addFromPaste() {
    const parsed = parseSkuPaste(paste);
    if (parsed.length === 0) {
      notify.error("Paste or type at least one SKU");
      return;
    }
    setRows((current) => [
      ...current,
      ...parsed.map((line) => ({ id: nextId.current++, sku: line.sku, qty: String(line.qty ?? 1) })),
    ]);
    setPaste("");
  }

  function updateRow(id: number, patch: Partial<EntryRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  const requestLines = rows.map((row) => ({
    sku: row.sku,
    qty: Math.min(MAX_LINE_QTY, Math.max(1, Math.floor(Number(row.qty)) || 1)),
  }));
  const normalized = normalizeRequestLines(requestLines);
  const tooMany = !normalized.ok && rows.some((row) => row.sku.trim());

  async function check() {
    if (!normalized.ok) {
      notify.error(normalized.error);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/products/order-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: normalized.lines.map(({ sku, qty }) => ({ sku, qty })) }),
      });
      const data = (await res.json()) as OrderAvailabilityResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Availability check failed");
      setResult(data);
      setSelected(null);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Availability check failed");
    } finally {
      setBusy(false);
    }
  }

  const optionCompanies = result?.companies.filter((row) => row.option) ?? [];
  const otherCompanies = result?.companies.filter((row) => !row.option) ?? [];
  const foundCount = result?.lines.filter((line) => line.found).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Order availability</h2>
        <p className="text-muted-foreground text-sm">
          Live stock in ERP2 main warehouses for multiple SKUs. Suggests which company to place the order under, within
          the monthly cap.
        </p>
      </div>

      {canManage ? <OrderAvailabilityPriorityEditor /> : null}

      <div className="max-w-2xl space-y-3">
        <div className="space-y-2">
          <Textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder={"Paste SKUs, one per line. Add a quantity after a comma if needed:\nSKU1, 2\nSKU2"}
            rows={4}
            disabled={busy}
            aria-label="Paste SKUs"
          />
          <Button type="button" variant="outline" onClick={addFromPaste} disabled={busy || !paste.trim()}>
            <Plus className="size-4" />
            Add to list
          </Button>
        </div>

        {rows.length > 0 ? (
          <div className="space-y-2">
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2">
                  <Input
                    value={row.sku}
                    onChange={(event) => updateRow(row.id, { sku: event.target.value })}
                    aria-label="SKU"
                    className="min-w-0 flex-1"
                    disabled={busy}
                  />
                  <Input
                    value={row.qty}
                    onChange={(event) => updateRow(row.id, { qty: event.target.value.replace(/[^\d]/g, "") })}
                    inputMode="numeric"
                    aria-label="Quantity"
                    className="w-20"
                    disabled={busy}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                    aria-label={`Remove ${row.sku}`}
                    disabled={busy}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {tooMany ? <p className="text-destructive text-sm">{!normalized.ok ? normalized.error : null}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void check()} disabled={busy || !normalized.ok}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Check {normalized.ok ? `${normalized.lines.length} SKU${normalized.lines.length === 1 ? "" : "s"}` : ""}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRows([]);
                  setResult(null);
                  setSelected(null);
                }}
                disabled={busy}
              >
                Clear all
              </Button>
              <span className="text-muted-foreground self-center text-xs">Up to {MAX_DISTINCT_SKUS} SKUs</span>
            </div>
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-6">
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>Checked at {formatAppTime(result.checkedAt)}</span>
            <span>
              Order value {result.orderValueIsLowerBound ? "≥ " : ""}
              {money(result.orderValue)}
            </span>
            <span>
              Cap {money(result.cap.limit)} per month ({result.capMonth})
            </span>
          </div>

          {result.notFound.length > 0 ? (
            <p className="text-sm">
              <span className="font-medium">Not found in ERP2:</span> {result.notFound.join(", ")}
            </p>
          ) : null}
          {result.unpricedSkus.length > 0 ? (
            <p className="text-sm">
              <span className="font-medium">No price, left out of the order value:</span>{" "}
              {result.unpricedSkus.join(", ")}
            </p>
          ) : null}
          {result.cap.error ? <p className="text-destructive text-sm">{result.cap.error}</p> : null}

          {foundCount > 0 ? (
            <section className="space-y-3">
              <h3 className="font-semibold">Suggested companies</h3>
              {result.noOptionReason ? (
                <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                  {noOptionText(result.noOptionReason, result.cap.limit)}
                </p>
              ) : (
                <>
                  {optionCompanies.length === 1 && result.companies.length > 1 ? (
                    <p className="text-muted-foreground text-sm">No other company has room under the cap for this order.</p>
                  ) : null}
                  <div className="grid gap-3 lg:grid-cols-3">
                    {optionCompanies.map((company) => (
                      <CompanyCard
                        key={company.company}
                        company={company}
                        result={result}
                        selected={selected === company.company}
                        onSelect={() => setSelected(company.company)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {foundCount > 0 && otherCompanies.length > 0 ? (
            <section className="space-y-3">
              <h3 className="font-semibold">Other companies</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {otherCompanies.map((company) => (
                  <CompanyCard
                    key={company.company}
                    company={company}
                    result={result}
                    selected={selected === company.company}
                    onSelect={() => setSelected(company.company)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {selected ? (
            <div ref={detailRef} className="scroll-mt-4">
              <DetailCard result={result} company={selected} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
