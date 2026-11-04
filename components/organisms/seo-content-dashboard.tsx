"use client";

import { Check, FolderOpen, Minus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ProductItemStorageSheet } from "@/components/organisms/product-item-storage-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SALES_WINDOW_DAYS,
  SHORT_VIDEO_MAX_SECONDS,
  type SeoContentDashboardData,
  type SeoFamilyRow,
  type SeoUploadKind,
} from "@/lib/seo-content/types";

const PAGE_SIZE = 50;
const ALL = "__all__";

type CoverageKey = "photo" | "short" | "long" | "voice";

const COVERAGE_CHECKS: { key: CoverageKey; label: string; has: (row: SeoFamilyRow) => boolean }[] = [
  { key: "photo", label: "Photos", has: (row) => row.photos > 0 },
  { key: "short", label: "Short video", has: (row) => row.shortVideos > 0 },
  { key: "long", label: "Long video", has: (row) => row.longVideos > 0 },
  { key: "voice", label: "Voice explanation", has: (row) => row.voiceExplanations > 0 },
];

type MissingFilter = typeof ALL | CoverageKey | "complete" | "none";
type SortKey = "sales" | "least" | "name" | "recent";

const ACTIVITY_KINDS: { key: SeoUploadKind; label: string }[] = [
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
  { key: "document", label: "Docs" },
  { key: "voice", label: "Academy voices" },
];

function coverageScore(row: SeoFamilyRow) {
  return COVERAGE_CHECKS.filter((check) => check.has(row)).length;
}

function formatMinutes(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function percent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function CoverageTile({ label, covered, total }: { label: string; covered: number; total: number }) {
  const pct = percent(covered, total);
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="text-xs font-medium">{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{pct}%</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 px-4">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          role="meter"
          aria-label={`${label} coverage`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {covered.toLocaleString()} of {total.toLocaleString()} products
        </p>
      </CardContent>
    </Card>
  );
}

function CountCell({ count, label, note }: { count: number; label: string; note?: string | null }) {
  return (
    <TableCell className="text-center">
      {count > 0 ? (
        <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`${count} ${label}`}>
          <Check className="size-3.5 text-primary" aria-hidden />
          {count}
        </span>
      ) : (
        <span className="inline-flex items-center text-muted-foreground" aria-label={`No ${label}`}>
          <Minus className="size-3.5" aria-hidden />
        </span>
      )}
      {note ? <div className="text-[10px] text-muted-foreground">{note}</div> : null}
    </TableCell>
  );
}

interface SeoContentDashboardProps {
  data: SeoContentDashboardData;
  canViewStorage: boolean;
}

export function SeoContentDashboard({ data, canViewStorage }: SeoContentDashboardProps) {
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [missing, setMissing] = useState<MissingFilter>(ALL);
  const [liveOnly, setLiveOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>("sales");
  const [page, setPage] = useState(1);
  const [activityDays, setActivityDays] = useState("30");
  const [storageRow, setStorageRow] = useState<SeoFamilyRow | null>(null);

  const vendors = useMemo(
    () => [...new Set(data.families.map((row) => row.vendor).filter((v): v is string => Boolean(v)))].sort(),
    [data.families],
  );
  const categories = useMemo(
    () => [...new Set(data.families.map((row) => row.category).filter((c): c is string => Boolean(c)))].sort(),
    [data.families],
  );

  // Scope = everything except the "missing" filter, so tiles describe the
  // selected brand/category and the table can then narrow to the gaps.
  const scoped = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.families.filter((row) => {
      if (liveOnly && !row.live) return false;
      if (vendor !== ALL && row.vendor !== vendor) return false;
      if (category !== ALL && row.category !== category) return false;
      if (term && !`${row.family} ${row.sampleSku ?? ""} ${row.vendor ?? ""}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [data.families, search, vendor, category, liveOnly]);

  const rows = useMemo(() => {
    const filtered = scoped.filter((row) => {
      if (missing === ALL) return true;
      const score = coverageScore(row);
      if (missing === "complete") return score === COVERAGE_CHECKS.length;
      if (missing === "none") return score === 0;
      return !COVERAGE_CHECKS.find((check) => check.key === missing)!.has(row);
    });
    const sorted = [...filtered];
    if (sort === "least") {
      sorted.sort((a, b) => coverageScore(a) - coverageScore(b) || b.unitsSold - a.unitsSold);
    } else if (sort === "name") {
      sorted.sort((a, b) => a.family.localeCompare(b.family));
    } else if (sort === "recent") {
      sorted.sort((a, b) => (b.lastUploadAt ?? "").localeCompare(a.lastUploadAt ?? ""));
    }
    // "sales" keeps the server order (units sold, then name).
    return sorted;
  }, [scoped, missing, sort]);

  const totals = useMemo(() => {
    const coverage = Object.fromEntries(
      COVERAGE_CHECKS.map((check) => [check.key, scoped.filter(check.has).length]),
    ) as Record<CoverageKey, number>;
    return {
      coverage,
      complete: scoped.filter((row) => coverageScore(row) === COVERAGE_CHECKS.length).length,
      videoSeconds: scoped.reduce((sum, row) => sum + row.videoSeconds, 0),
      shortVideos: scoped.reduce((sum, row) => sum + row.shortVideos, 0),
      longVideos: scoped.reduce((sum, row) => sum + row.longVideos, 0),
      untimedVideos: scoped.reduce((sum, row) => sum + row.unknownLengthVideos, 0),
    };
  }, [scoped]);

  const activity = useMemo(() => {
    const since = new Date(data.generatedAt).getTime() - Number(activityDays) * 24 * 60 * 60 * 1000;
    const byPerson = new Map<string, Record<SeoUploadKind, number>>();
    for (const event of data.uploads) {
      if (new Date(event.at).getTime() < since) continue;
      const counts = byPerson.get(event.person) ?? { photo: 0, video: 0, audio: 0, document: 0, voice: 0 };
      counts[event.kind] += 1;
      byPerson.set(event.person, counts);
    }
    const people = [...byPerson.entries()]
      .map(([person, counts]) => ({
        person,
        counts,
        total: Object.values(counts).reduce((sum, n) => sum + n, 0),
      }))
      .sort((a, b) => b.total - a.total || a.person.localeCompare(b.person));
    const columnTotals = Object.fromEntries(
      ACTIVITY_KINDS.map((kind) => [kind.key, people.reduce((sum, p) => sum + p.counts[kind.key], 0)]),
    ) as Record<SeoUploadKind, number>;
    return { people, columnTotals, total: people.reduce((sum, p) => sum + p.total, 0) };
  }, [data.uploads, data.generatedAt, activityDays]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setPage(1);
    setter(value);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Product Management</p>
        <h1 className="text-2xl font-semibold">SEO Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photo, video and voice coverage per product family, ranked by units sold in the last {SALES_WINDOW_DAYS}{" "}
          days. Short video = up to {SHORT_VIDEO_MAX_SECONDS}s.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            placeholder="Search product, SKU, brand..."
            className="pl-8"
            aria-label="Search products"
          />
        </div>
        <Select value={vendor} onValueChange={resetPage(setVendor)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Brand">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All brands</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={resetPage(setCategory)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={missing} onValueChange={(v) => resetPage(setMissing)(v as MissingFilter)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Coverage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any coverage</SelectItem>
            <SelectItem value="photo">Missing photos</SelectItem>
            <SelectItem value="short">Missing short video</SelectItem>
            <SelectItem value="long">Missing long video</SelectItem>
            <SelectItem value="voice">Missing voice explanation</SelectItem>
            <SelectItem value="none">No content at all</SelectItem>
            <SelectItem value="complete">Fully covered</SelectItem>
          </SelectContent>
        </Select>
        <Select value={liveOnly ? "live" : "all"} onValueChange={(v) => resetPage(setLiveOnly)(v === "live")}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Product status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">Hide draft / archived</SelectItem>
            <SelectItem value="all">All products</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => resetPage(setSort)(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">Best-sellers first</SelectItem>
            <SelectItem value="least">Least covered first</SelectItem>
            <SelectItem value="recent">Recently updated</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs font-medium">Products</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{scoped.length.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground tabular-nums">
              {totals.complete.toLocaleString()} fully covered
            </p>
          </CardContent>
        </Card>
        {COVERAGE_CHECKS.map((check) => (
          <CoverageTile key={check.key} label={check.label} covered={totals.coverage[check.key]} total={scoped.length} />
        ))}
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs font-medium">Video library</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMinutes(totals.videoSeconds)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground tabular-nums">
              {totals.shortVideos} short · {totals.longVideos} long
              {totals.untimedVideos > 0 ? ` · ${totals.untimedVideos} untimed` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Coverage table */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b border-border/60 px-4 py-3">
          <CardTitle className="text-base">Coverage by product</CardTitle>
          <CardDescription>
            {rows.length.toLocaleString()} products
            {canViewStorage ? " · open a row's files to upload what's missing" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead className="text-right">Sold {SALES_WINDOW_DAYS}d</TableHead>
                <TableHead className="text-center">Photos</TableHead>
                <TableHead className="text-center">Short video</TableHead>
                <TableHead className="text-center">Long video</TableHead>
                <TableHead className="text-center">Voice</TableHead>
                <TableHead className="text-center">Docs</TableHead>
                <TableHead className="text-center">Coverage</TableHead>
                <TableHead>Last upload</TableHead>
                {canViewStorage ? <TableHead className="pr-4" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canViewStorage ? 10 : 9} className="py-12 text-center text-muted-foreground">
                    No products match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => {
                  const score = coverageScore(row);
                  return (
                    <TableRow key={row.family}>
                      <TableCell className="pl-4">
                        <div className="flex min-w-56 items-center gap-3">
                          {row.imageUrl ? (
                            <img
                              src={row.imageUrl}
                              alt=""
                              className="size-9 shrink-0 rounded-md object-cover ring-1 ring-border/50"
                            />
                          ) : (
                            <div className="size-9 shrink-0 rounded-md bg-secondary/50" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.family}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[row.vendor, row.category, `${row.skuCount} SKU${row.skuCount === 1 ? "" : "s"}`]
                                .filter(Boolean)
                                .join(" · ")}
                              {!row.live ? " · draft/archived" : ""}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.unitsSold.toLocaleString()}</TableCell>
                      <CountCell count={row.photos} label="photos" />
                      <CountCell
                        count={row.shortVideos}
                        label="short videos"
                        note={row.unknownLengthVideos > 0 ? `+${row.unknownLengthVideos} untimed` : null}
                      />
                      <CountCell count={row.longVideos} label="long videos" />
                      <CountCell count={row.voiceExplanations} label="voice explanations" />
                      <CountCell count={row.documents} label="documents" />
                      <TableCell className="text-center tabular-nums">
                        {score}/{COVERAGE_CHECKS.length}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(row.lastUploadAt)}
                      </TableCell>
                      {canViewStorage ? (
                        <TableCell className="pr-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!row.sampleSku}
                            onClick={() => setStorageRow(row)}
                          >
                            <FolderOpen className="size-4" />
                            Files
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              Page {currentPage} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team activity */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <CardTitle className="text-base">Team activity</CardTitle>
            <CardDescription>Files uploaded per person, all products</CardDescription>
          </div>
          <Select value={activityDays} onValueChange={setActivityDays}>
            <SelectTrigger className="w-36" aria-label="Activity period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Person</TableHead>
                {ACTIVITY_KINDS.map((kind) => (
                  <TableHead key={kind.key} className="text-right">
                    {kind.label}
                  </TableHead>
                ))}
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.people.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={ACTIVITY_KINDS.length + 2} className="py-10 text-center text-muted-foreground">
                    No uploads in this period.
                  </TableCell>
                </TableRow>
              ) : (
                activity.people.map((person) => (
                  <TableRow key={person.person}>
                    <TableCell className="pl-4 font-medium">{person.person}</TableCell>
                    {ACTIVITY_KINDS.map((kind) => (
                      <TableCell key={kind.key} className="text-right tabular-nums">
                        {person.counts[kind.key] || <span className="text-muted-foreground">0</span>}
                      </TableCell>
                    ))}
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">{person.total}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {activity.people.length > 1 ? (
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4">Total</TableCell>
                  {ACTIVITY_KINDS.map((kind) => (
                    <TableCell key={kind.key} className="text-right tabular-nums">
                      {activity.columnTotals[kind.key]}
                    </TableCell>
                  ))}
                  <TableCell className="pr-4 text-right tabular-nums">{activity.total}</TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </CardContent>
      </Card>

      {storageRow ? (
        <ProductItemStorageSheet
          open
          onClose={() => setStorageRow(null)}
          sku={storageRow.sampleSku}
          productTitle={storageRow.sampleTitle}
          familyName={storageRow.family}
        />
      ) : null}
    </div>
  );
}
