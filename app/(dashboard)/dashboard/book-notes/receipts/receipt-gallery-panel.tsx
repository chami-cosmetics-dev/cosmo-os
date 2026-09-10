"use client";

import { useMemo, useState } from "react";
import { Images, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BookNoteLocationOption,
  BookNoteReceiptGalleryItem,
} from "@/lib/book-notes/types";
import { notify } from "@/lib/notify";

const ALL_SHOPS = "__all__";

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type GalleryGroup = {
  key: string;
  shopName: string;
  posting_date: string;
  items: BookNoteReceiptGalleryItem[];
};

/** Group the flat receipt list into one block per shop + posting date. */
function groupItems(items: BookNoteReceiptGalleryItem[]): GalleryGroup[] {
  const groups = new Map<string, GalleryGroup>();
  for (const item of items) {
    const key = `${item.companyLocationId}:${item.posting_date}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(key, {
      key,
      shopName: item.shopName,
      posting_date: item.posting_date,
      items: [item],
    });
  }
  return [...groups.values()];
}

type PanelProps = {
  initialLocations: BookNoteLocationOption[];
  initialItems: BookNoteReceiptGalleryItem[];
  initialFrom: string;
  initialTo: string;
  today: string;
};

export function BookNoteReceiptGalleryPanel({
  initialLocations,
  initialItems,
  initialFrom,
  initialTo,
  today,
}: PanelProps) {
  const [locations] = useState(initialLocations);
  const [items, setItems] = useState(initialItems);
  const [companyLocationId, setCompanyLocationId] = useState(ALL_SHOPS);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [appliedRange, setAppliedRange] = useState({
    from: initialFrom,
    to: initialTo,
  });
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<BookNoteReceiptGalleryItem | null>(
    null,
  );

  const groups = useMemo(() => groupItems(items), [items]);

  async function applyFilters() {
    if (from > to) {
      notify.error("From date must be on or before To date");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (companyLocationId !== ALL_SHOPS) {
        params.set("companyLocationId", companyLocationId);
      }
      const res = await fetch(
        `/api/admin/book-notes/receipts/gallery?${params}`,
      );
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load receipt images");
        return;
      }
      setItems((data.items as BookNoteReceiptGalleryItem[]) ?? []);
      setAppliedRange({ from, to });
    } catch {
      notify.error("Failed to load receipt images");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Book Note Receipts
        </h1>
        <p className="text-muted-foreground text-sm">
          Payment slips merchants uploaded with their daily book notes. Pick an
          outlet and a date range to review them. Read-only — uploading and
          removing stays with the shop that entered the book note.
        </p>
      </div>

      <div className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-4">
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            Outlet
          </label>
          <Select
            value={companyLocationId}
            disabled={loading}
            onValueChange={setCompanyLocationId}
          >
            <SelectTrigger>
              <SelectValue placeholder="All outlets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SHOPS}>All outlets</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.shortName ? `${loc.shortName} — ${loc.name}` : loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            From
          </label>
          <Input
            type="date"
            value={from}
            max={today}
            disabled={loading}
            className="font-medium tabular-nums"
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            To
          </label>
          <Input
            type="date"
            value={to}
            max={today}
            disabled={loading}
            className="font-medium tabular-nums"
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            className="w-full"
            disabled={loading}
            onClick={() => void applyFilters()}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Loading...
              </>
            ) : (
              <>
                <Images className="h-4 w-4" />
                Show receipts
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        {items.length} image{items.length === 1 ? "" : "s"} across{" "}
        {groups.length} book note day{groups.length === 1 ? "" : "s"} ·{" "}
        {appliedRange.from} to {appliedRange.to}
      </p>

      {groups.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-lg border p-8 text-center text-sm">
          No receipt images uploaded for this outlet and date range.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key} className="bg-card rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {group.shopName}
                  <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">
                    {group.posting_date}
                  </span>
                </h2>
                <span className="text-muted-foreground text-xs">
                  {group.items.length} image
                  {group.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="bg-muted/30 overflow-hidden rounded-md border"
                  >
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => setPreview(item)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={`${group.shopName} ${group.posting_date} — ${item.fileName}`}
                        loading="lazy"
                        className="h-32 w-full object-cover"
                      />
                      <span className="text-muted-foreground block truncate px-2 py-1 text-[11px]">
                        {item.fileName}
                        {formatBytes(item.fileSize)
                          ? ` · ${formatBytes(item.fileSize)}`
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {preview?.shopName}
              <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">
                {preview?.posting_date}
              </span>
            </DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.fileName}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="truncate">{preview.fileName}</span>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Open full size
                </a>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
