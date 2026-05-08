"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

type LocationOpt = {
  id: string;
  name: string;
  manualInvoicePrefix: string | null;
  manualInvoiceSeqPadding: number;
  defaultMerchantUserId: string | null;
};

type ProductRow = {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
};

type ShipRow = { id: string; label: string; amount: string; sortOrder: number };

type Merchant = { id: string; name: string | null; email: string | null };

type DraftLine = {
  key: string;
  productItemId: string;
  label: string;
  unitList: number;
  quantity: number;
  discountPercent: string;
};

function parseMoney(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function CreateManualOrderPanel() {
  const { confirm } = useConfirmationDialog();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /** Initial load: locations + merchants only (fast). */
  const [loadingInitial, setLoadingInitial] = useState(true);
  /** After a location is selected: products + shipping for that branch. */
  const [loadingLocationItems, setLoadingLocationItems] = useState(false);
  /** Debounced server search (2+ characters). */
  const [searchingProducts, setSearchingProducts] = useState(false);
  const locationAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const phoneLookupAbortRef = useRef<AbortController | null>(null);
  const prefillFromServerRef = useRef(false);

  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [productItems, setProductItems] = useState<ProductRow[]>([]);
  const [totalProductItems, setTotalProductItems] = useState<number | null>(null);
  const [productItemsTruncated, setProductItemsTruncated] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductRow[] | null>(null);
  const [shippingCharges, setShippingCharges] = useState<ShipRow[]>([]);
  const [productFilter, setProductFilter] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [orderDiscount, setOrderDiscount] = useState("");
  const [shippingId, setShippingId] = useState<string>("__none");
  const [assignedMerchantId, setAssignedMerchantId] = useState<string>("__default");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const customerPhoneRef = useRef(customerPhone);
  customerPhoneRef.current = customerPhone;
  const [customerEmail, setCustomerEmail] = useState("");
  const [shipAddr1, setShipAddr1] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  /** When true, name/email/shipping fields are read-only until the user edits. */
  const [customerDetailsLocked, setCustomerDetailsLocked] = useState(false);
  const [customerLookupHint, setCustomerLookupHint] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  const selectedLoc = useMemo(
    () => locations.find((l) => l.id === locationId),
    [locations, locationId]
  );

  const loadInitialPageData = useCallback(async () => {
    const res = await fetch("/api/admin/orders/manual/page-data");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load");
      return;
    }
    const data = (await res.json()) as {
      locations: LocationOpt[];
      merchants: Merchant[];
    };
    setLocations(data.locations);
    setMerchants(data.merchants ?? []);
  }, []);

  const loadLocationItems = useCallback(async (locId: string, signal: AbortSignal) => {
    const res = await fetch(
      `/api/admin/orders/manual/location-items?location_id=${encodeURIComponent(locId)}`,
      { signal }
    );
    if (!res.ok) {
      let message = "Failed to load items for this location";
      try {
        const data = (await res.json()) as { error?: string };
        message = data.error ?? message;
      } catch {
        /* ignore */
      }
      notify.error(message);
      setProductItems([]);
      setShippingCharges([]);
      setTotalProductItems(null);
      setProductItemsTruncated(false);
      return;
    }
    const data = (await res.json()) as {
      shippingCharges: ShipRow[];
      productItems: ProductRow[];
      totalProductItems: number;
      productItemsTruncated: boolean;
    };
    setShippingCharges(data.shippingCharges ?? []);
    setProductItems(data.productItems ?? []);
    setTotalProductItems(data.totalProductItems ?? 0);
    setProductItemsTruncated(Boolean(data.productItemsTruncated));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingInitial(true);
      try {
        await loadInitialPageData();
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInitialPageData]);

  useEffect(() => {
    if (!locationId) {
      setProductItems([]);
      setShippingCharges([]);
      setTotalProductItems(null);
      setProductItemsTruncated(false);
      setSearchResults(null);
      setSearchingProducts(false);
      return;
    }

    locationAbortRef.current?.abort();
    const controller = new AbortController();
    locationAbortRef.current = controller;

    let cancelled = false;
    (async () => {
      setLoadingLocationItems(true);
      setProductFilter("");
      setSearchResults(null);
      try {
        await loadLocationItems(locationId, controller.signal);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!cancelled) notify.error("Failed to load location items");
      } finally {
        if (!controller.signal.aborted) setLoadingLocationItems(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [locationId, loadLocationItems]);

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length < 6) {
      phoneLookupAbortRef.current?.abort();
      setCustomerLookupLoading(false);
      if (prefillFromServerRef.current) {
        setCustomerName("");
        setCustomerEmail("");
        setShipAddr1("");
        setShipCity("");
        setCustomerDetailsLocked(false);
        setCustomerLookupHint(null);
        prefillFromServerRef.current = false;
      }
      return;
    }

    const t = window.setTimeout(() => {
      const phoneAtRequest = customerPhoneRef.current.trim();
      const controller = new AbortController();
      phoneLookupAbortRef.current = controller;
      setCustomerLookupLoading(true);
      (async () => {
        try {
          const res = await fetch(
            `/api/admin/contacts/lookup-by-phone?phone=${encodeURIComponent(phoneAtRequest)}`,
            { signal: controller.signal }
          );
          if (controller.signal.aborted) return;
          if (phoneAtRequest !== customerPhoneRef.current.trim()) return;
          const data = (await res.json()) as {
            found?: boolean;
            source?: "contact" | "order" | "both";
            customerName?: string;
            customerEmail?: string | null;
            shippingAddressLine1?: string | null;
            shippingCity?: string | null;
          };
          if (!res.ok) {
            return;
          }
          if (phoneAtRequest !== customerPhoneRef.current.trim()) return;
          if (!data.found) {
            if (prefillFromServerRef.current) {
              setCustomerName("");
              setCustomerEmail("");
              setShipAddr1("");
              setShipCity("");
              setCustomerDetailsLocked(false);
              setCustomerLookupHint(null);
              prefillFromServerRef.current = false;
            }
            return;
          }
          setCustomerName(data.customerName ?? "");
          setCustomerEmail(data.customerEmail ?? "");
          setShipAddr1(data.shippingAddressLine1 ?? "");
          setShipCity(data.shippingCity ?? "");
          setCustomerDetailsLocked(true);
          prefillFromServerRef.current = true;
          if (data.source === "contact") {
            setCustomerLookupHint("Matched from your contact list.");
          } else if (data.source === "order") {
            setCustomerLookupHint("Details from a previous order with this number.");
          } else {
            setCustomerLookupHint(
              "Contact matched; shipping address from the latest related order."
            );
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        } finally {
          if (!controller.signal.aborted) setCustomerLookupLoading(false);
        }
      })();
    }, 520);

    return () => {
      window.clearTimeout(t);
      phoneLookupAbortRef.current?.abort();
    };
  }, [customerPhone]);

  useEffect(() => {
    const q = productFilter.trim();
    if (q.length < 2 || !locationId) {
      setSearchResults(null);
      setSearchingProducts(false);
      searchAbortRef.current?.abort();
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const t = window.setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const res = await fetch(
          `/api/admin/orders/manual/product-search?location_id=${encodeURIComponent(locationId)}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          notify.error(data.error ?? "Search failed");
          setSearchResults([]);
          return;
        }
        const data = (await res.json()) as { productItems: ProductRow[] };
        setSearchResults(data.productItems ?? []);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        notify.error("Search failed");
      } finally {
        setSearchingProducts(false);
      }
    }, 320);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [productFilter, locationId]);

  useEffect(() => {
    if (!selectedLoc) return;
    setAssignedMerchantId(
      selectedLoc.defaultMerchantUserId
        ? selectedLoc.defaultMerchantUserId
        : "__none"
    );
  }, [selectedLoc]);

  /** Browsable list (short filter) or server search hits (2+ chars). */
  const displayedProducts = useMemo(() => {
    const qRaw = productFilter.trim();
    const q = qRaw.toLowerCase();

    if (qRaw.length >= 2 && searchResults !== null) {
      return searchResults.slice(0, 80);
    }

    if (!q) return productItems.slice(0, 80);
    return productItems
      .filter(
        (p) =>
          p.productTitle.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false) ||
          (p.variantTitle?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 80);
  }, [productItems, productFilter, searchResults]);

  function addProduct(p: ProductRow) {
    const unitList = parseMoney(p.price);
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productItemId: p.id,
        label: [p.productTitle, p.variantTitle].filter(Boolean).join(" — "),
        unitList,
        quantity: 1,
        discountPercent: "",
      },
    ]);
    notify.success("Item added");
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  async function removeLine(key: string) {
    const confirmed = await confirm({
      title: "Remove line item?",
      description: "This product line will be removed from the manual order.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const orderPricing = useMemo(() => {
    const orderD = Math.min(100, Math.max(0, parseFloat(orderDiscount.trim()) || 0));
    let listSubtotal = 0;
    let saleSubtotal = 0;
    const perLine: Record<
      string,
      {
        effectiveDiscountPct: number;
        unitList: number;
        unitSale: number;
        lineList: number;
        lineSale: number;
      }
    > = {};
    for (const line of lines) {
      const qty = Math.max(1, line.quantity);
      const lineD =
        line.discountPercent.trim() === ""
          ? orderD
          : Math.min(100, Math.max(0, parseFloat(line.discountPercent) || 0));
      const factor = 1 - lineD / 100;
      const unitList = line.unitList;
      const unitSale = unitList * factor;
      const lineList = unitList * qty;
      const lineSale = unitSale * qty;
      listSubtotal += lineList;
      saleSubtotal += lineSale;
      perLine[line.key] = {
        effectiveDiscountPct: lineD,
        unitList,
        unitSale,
        lineList,
        lineSale,
      };
    }
    const ship =
      shippingId === "__none"
        ? 0
        : parseMoney(shippingCharges.find((s) => s.id === shippingId)?.amount ?? "0");
    return {
      perLine,
      listSubtotal,
      discountAmount: listSubtotal - saleSubtotal,
      shipping: ship,
      total: saleSubtotal + ship,
    };
  }, [lines, orderDiscount, shippingId, shippingCharges]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) {
      notify.error("Select a location");
      return;
    }
    if (!selectedLoc?.manualInvoicePrefix?.trim()) {
      notify.error(
        "This location has no manual invoice prefix. Configure it in Settings → Locations."
      );
      return;
    }
    if (lines.length === 0) {
      notify.error("Add at least one product");
      return;
    }

    setBusyKey("submit");
    try {
      const body: Record<string, unknown> = {
        companyLocationId: locationId,
        lines: lines.map((l) => ({
          productItemId: l.productItemId,
          quantity: l.quantity,
          ...(l.discountPercent.trim() !== "" && {
            discountPercent: parseFloat(l.discountPercent),
          }),
        })),
        orderDiscountPercent: parseFloat(orderDiscount.trim()) || 0,
        ...(shippingId !== "__none" && { shippingChargeOptionId: shippingId }),
        ...(assignedMerchantId === "__none" && { assignedMerchantId: null }),
        ...(assignedMerchantId !== "__default" &&
          assignedMerchantId !== "__none" && {
            assignedMerchantId,
          }),
        ...(customerName.trim() && { customerName: customerName.trim() }),
        ...(customerPhone.trim() && { customerPhone: customerPhone.trim() }),
        ...(customerEmail.trim() && { customerEmail: customerEmail.trim() }),
        shippingAddress:
          shipAddr1.trim() || shipCity.trim()
            ? {
                name: customerName.trim() || undefined,
                address1: shipAddr1.trim() || undefined,
                city: shipCity.trim() || undefined,
              }
            : undefined,
      };

      const res = await fetch("/api/admin/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        orderId?: string;
        invoiceNumber?: string;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to create order");
        return;
      }
      notify.success(`Order ${data.invoiceNumber ?? ""} created`);
      setLines([]);
      setOrderDiscount("");
      setShippingId("__none");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setShipAddr1("");
      setShipCity("");
      setCustomerDetailsLocked(false);
      setCustomerLookupHint(null);
      prefillFromServerRef.current = false;
    } catch {
      notify.error("Failed to create order");
    } finally {
      setBusyKey(null);
    }
  }

  if (loadingInitial) {
    return (
      <div className="flex flex-col gap-2 text-muted-foreground text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading order form…
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Orders
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <ShoppingCart className="size-5 text-muted-foreground" />
          Create Manual Order
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Build a branch-based order from your item master and use the invoice prefix configured in{" "}
          <Link href="/dashboard/settings" className="underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Branch</p>
          <p className="mt-2 text-sm font-semibold">{selectedLoc?.name ?? "Choose a location"}</p>
          <p className="text-muted-foreground mt-1 text-xs">Products, shipping, and invoice prefix come from the selected branch.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Cart</p>
          <p className="mt-2 text-sm font-semibold">{lines.length} line items</p>
          <p className="text-muted-foreground mt-1 text-xs">Add products first, then refine quantity and discount.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Total</p>
          <p className="mt-2 text-sm font-semibold">{orderPricing.total.toLocaleString("en-LK", { minimumFractionDigits: 2 })} LKR</p>
          <p className="text-muted-foreground mt-1 text-xs">Live total including line discounts and shipping.</p>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle>Location</CardTitle>
          <CardDescription>
            Choose where the order belongs. Items and shipping options are loaded for that branch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <label htmlFor="manual-order-location" className="text-sm font-medium">
            Location
          </label>
          <Select
            value={locationId || undefined}
            onValueChange={(v) => {
              setLocationId(v);
              setLines([]);
              setShippingId("__none");
            }}
            disabled={isBusy}
          >
            <SelectTrigger id="manual-order-location" className="max-w-md border-border/70 bg-background/90">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                  {!l.manualInvoicePrefix?.trim() ? " (set invoice prefix in Settings)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedLoc && !selectedLoc.manualInvoicePrefix?.trim() && (
            <p className="text-destructive text-sm">
              Configure a manual invoice prefix for this location before creating orders.
            </p>
          )}
        </CardContent>
      </Card>

      {locationId && (
        <>
          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
              <CardTitle>Add products</CardTitle>
              <CardDescription>
                Set a global discount to apply to every line (shown on each row). Editing any line’s
                discount clears global and uses per-line % only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="product-filter" className="text-sm font-medium">
                    Search products
                  </label>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    {loadingLocationItems && (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        Loading items…
                      </span>
                    )}
                    {!loadingLocationItems && searchingProducts && (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        Searching…
                      </span>
                    )}
                    {!loadingLocationItems &&
                      totalProductItems != null &&
                      productItems.length > 0 && (
                        <span>
                          {productItems.length.toLocaleString()}
                          {productItemsTruncated ? "+" : ""} of{" "}
                          {totalProductItems.toLocaleString()} loaded
                          {productFilter.trim().length >= 2
                            ? " · type 2+ chars to search server"
                            : ""}
                        </span>
                      )}
                  </div>
                </div>
                <Input
                  id="product-filter"
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  placeholder="Search by title or SKU…"
                  disabled={isBusy || loadingLocationItems}
                  className="border-border/70 bg-background/90"
                />
                {productItemsTruncated && !loadingLocationItems && (
                  <p className="text-muted-foreground text-xs">
                    Showing the first batch of items. Type at least 2 characters to search the full
                    catalog.
                  </p>
                )}
              </div>
              <div className="relative h-48 overflow-y-auto rounded-xl border border-border/70 bg-background/85">
                {loadingLocationItems && (
                  <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl text-sm">
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                    Loading products for this location…
                  </div>
                )}
                <ul className="divide-y p-2 text-sm">
                  {displayedProducts.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {p.productTitle}
                          {p.variantTitle ? ` — ${p.variantTitle}` : ""}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {p.sku ?? "—"} ·{" "}
                          {parseMoney(p.price).toLocaleString("en-LK", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          LKR
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => addProduct(p)}
                        disabled={isBusy || loadingLocationItems}
                      >
                        <Plus className="size-4" aria-hidden />
                        Add
                      </Button>
                    </li>
                  ))}
                  {!loadingLocationItems && displayedProducts.length === 0 && (
                    <li className="text-muted-foreground py-6 text-center">No matching products</li>
                  )}
                </ul>
              </div>

              <div className="space-y-2">
                <label htmlFor="order-discount" className="text-sm font-medium">
                  Global discount (%)
                </label>
                <Input
                  id="order-discount"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={orderDiscount}
                  onChange={(e) => {
                    setOrderDiscount(e.target.value);
                    setLines((prev) =>
                      prev.map((l) => ({ ...l, discountPercent: "" }))
                    );
                  }}
                  placeholder="0"
                  className="max-w-xs border-border/70 bg-background/90"
                  disabled={isBusy}
                />
                <p className="text-muted-foreground text-xs">
                  Changing this resets line discounts so all rows use the same %.
                </p>
              </div>

              {lines.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border/70 bg-background/90 shadow-xs">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] text-left">
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2 text-right">Unit</th>
                        <th className="px-3 py-2">Disc %</th>
                        <th className="px-3 py-2 text-right">Line total</th>
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const p = orderPricing.perLine[line.key];
                        const hasDisc = p && p.effectiveDiscountPct > 0;
                        return (
                          <tr key={line.key} className="border-b border-border/50">
                            <td className="px-3 py-2">
                              <p className="font-medium">{line.label}</p>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={1}
                                className="w-20 border-border/70 bg-background/90"
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(line.key, {
                                    quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                  })
                                }
                                disabled={isBusy}
                              />
                            </td>
                            <td className="px-3 py-2 text-right align-top">
                              {p && (
                                <div className="space-y-0.5">
                                  {hasDisc ? (
                                    <>
                                      <p className="text-muted-foreground text-xs line-through">
                                        {p.unitList.toLocaleString("en-LK", {
                                          minimumFractionDigits: 2,
                                        })}{" "}
                                        LKR
                                      </p>
                                      <p className="font-medium tabular-nums">
                                        {p.unitSale.toLocaleString("en-LK", {
                                          minimumFractionDigits: 2,
                                        })}{" "}
                                        LKR
                                        <span className="text-muted-foreground font-normal"> / unit</span>
                                      </p>
                                    </>
                                  ) : (
                                    <p className="tabular-nums">
                                      {p.unitList.toLocaleString("en-LK", {
                                        minimumFractionDigits: 2,
                                      })}{" "}
                                      LKR
                                      <span className="text-muted-foreground"> / unit</span>
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  className="w-28 border-border/70 bg-background/90"
                                  placeholder={
                                    orderDiscount.trim() !== ""
                                      ? `${orderDiscount} (global)`
                                      : "0"
                                  }
                                  value={line.discountPercent}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v.trim() !== "") {
                                      setOrderDiscount("");
                                    }
                                    updateLine(line.key, {
                                      discountPercent: v,
                                    });
                                  }}
                                  disabled={isBusy}
                                />
                                <p className="text-muted-foreground text-xs">
                                  {line.discountPercent.trim() !== "" ? (
                                    <>Line-specific % (global cleared)</>
                                  ) : orderDiscount.trim() !== "" ? (
                                    <>
                                      Effective:{" "}
                                      {(parseFloat(orderDiscount.trim()) || 0).toLocaleString("en-LK", {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 2,
                                      })}
                                      % (global)
                                    </>
                                  ) : (
                                    <>Effective: 0%</>
                                  )}
                                </p>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right align-top">
                              {p && (
                                <div className="space-y-0.5">
                                  {hasDisc ? (
                                    <>
                                      <p className="text-muted-foreground text-xs line-through">
                                        {p.lineList.toLocaleString("en-LK", {
                                          minimumFractionDigits: 2,
                                        })}{" "}
                                        LKR
                                      </p>
                                      <p className="font-semibold tabular-nums">
                                        {p.lineSale.toLocaleString("en-LK", {
                                          minimumFractionDigits: 2,
                                        })}{" "}
                                        LKR
                                      </p>
                                      <p className="text-muted-foreground text-xs">
                                        −
                                        {(p.lineList - p.lineSale).toLocaleString("en-LK", {
                                          minimumFractionDigits: 2,
                                        })}{" "}
                                        LKR
                                      </p>
                                    </>
                                  ) : (
                                    <p className="font-medium tabular-nums">
                                      {p.lineSale.toLocaleString("en-LK", {
                                        minimumFractionDigits: 2,
                                      })}{" "}
                                      LKR
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeLine(line.key)}
                                disabled={isBusy}
                                aria-label="Remove line"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
              <CardTitle>Shipping & assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-medium">Shipping charge</span>
                <Select
                  value={shippingId}
                  onValueChange={setShippingId}
                  disabled={isBusy}
                >
                  <SelectTrigger className="max-w-md border-border/70 bg-background/90">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {shippingCharges.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label} (
                        {parseMoney(s.amount).toLocaleString("en-LK", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        LKR)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {merchants.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Merchant</span>
                  <Select
                    value={assignedMerchantId}
                    onValueChange={setAssignedMerchantId}
                    disabled={isBusy}
                  >
                    <SelectTrigger className="max-w-md border-border/70 bg-background/90">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default">Location default</SelectItem>
                      <SelectItem value="__none">None</SelectItem>
                      {merchants.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name || m.email || m.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
              <CardTitle>Customer</CardTitle>
              <CardDescription>
                Enter the mobile number first. We match your company contact list (and recent orders)
                to fill name, email, and shipping. You can edit details anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="cust-phone" className="text-sm font-medium">
                  Mobile number
                </label>
                <div className="relative max-w-md">
                  <Input
                    id="cust-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={isBusy}
                    placeholder="e.g. 077…"
                    className="border-border/70 bg-background/90 pr-10"
                    aria-busy={customerLookupLoading}
                  />
                  {customerLookupLoading && (
                    <Loader2
                      className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
                      aria-hidden
                    />
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  After at least 6 digits, we look up this number. Other fields fill in when we find a
                  match.
                </p>
              </div>

              {customerLookupHint && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{customerLookupHint}</span>
                  {customerDetailsLocked && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={isBusy}
                      onClick={() => {
                        setCustomerDetailsLocked(false);
                        prefillFromServerRef.current = false;
                      }}
                    >
                      Edit details
                    </Button>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="cust-name" className="text-sm font-medium">
                    Name
                  </label>
                  <Input
                    id="cust-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={isBusy}
                    readOnly={customerDetailsLocked}
                    className={customerDetailsLocked ? "border-border/70 bg-muted/50" : "border-border/70 bg-background/90"}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="cust-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="cust-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    disabled={isBusy}
                    readOnly={customerDetailsLocked}
                    className={customerDetailsLocked ? "border-border/70 bg-muted/50" : "border-border/70 bg-background/90"}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="ship-addr" className="text-sm font-medium">
                    Shipping address
                  </label>
                  <Textarea
                    id="ship-addr"
                    value={shipAddr1}
                    onChange={(e) => setShipAddr1(e.target.value)}
                    placeholder="Street address"
                    rows={2}
                    disabled={isBusy}
                    readOnly={customerDetailsLocked}
                    className={customerDetailsLocked ? "border-border/70 bg-muted/50" : "border-border/70 bg-background/90"}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="ship-city" className="text-sm font-medium">
                    City
                  </label>
                  <Input
                    id="ship-city"
                    value={shipCity}
                    onChange={(e) => setShipCity(e.target.value)}
                    disabled={isBusy}
                    readOnly={customerDetailsLocked}
                    className={customerDetailsLocked ? "border-border/70 bg-muted/50" : "border-border/70 bg-background/90"}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">List subtotal</span>
                <span>
                  {orderPricing.listSubtotal.toLocaleString("en-LK", { minimumFractionDigits: 2 })} LKR
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>
                  −
                  {orderPricing.discountAmount.toLocaleString("en-LK", { minimumFractionDigits: 2 })} LKR
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>
                  {orderPricing.shipping.toLocaleString("en-LK", { minimumFractionDigits: 2 })} LKR
                </span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2 font-semibold">
                <span>Total</span>
                <span>
                  {orderPricing.total.toLocaleString("en-LK", { minimumFractionDigits: 2 })} LKR
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4">
            <Button
              type="submit"
              disabled={isBusy || loadingInitial || loadingLocationItems}
              size="lg"
              className="shadow-[0_10px_24px_-18px_var(--primary)]"
            >
              {busyKey === "submit" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                "Create order"
              )}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
