"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Pagination } from "@/components/ui/pagination";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { notify } from "@/lib/notify";

type Vendor = {
  id: string;
  name: string;
  _count?: { productItems: number };
};

type Category = {
  id: string;
  name: string;
  fullName: string | null;
  _count?: { productItems: number };
};

interface VendorsCategoriesPanelProps {
  canManage: boolean;
}

export function VendorsCategoriesPanel({ canManage }: VendorsCategoriesPanelProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"vendors" | "categories">("vendors");
  const [vendorsPage, setVendorsPage] = useState(1);
  const [vendorsLimit, setVendorsLimit] = useState(10);
  const [vendorsTotal, setVendorsTotal] = useState(0);
  const [vendorsSortBy, setVendorsSortBy] = useState<string>("");
  const [vendorsSortOrder, setVendorsSortOrder] = useState<"asc" | "desc">("asc");
  const [categoriesPage, setCategoriesPage] = useState(1);
  const [categoriesLimit, setCategoriesLimit] = useState(10);
  const [categoriesTotal, setCategoriesTotal] = useState(0);
  const [categoriesSortBy, setCategoriesSortBy] = useState<string>("");
  const [categoriesSortOrder, setCategoriesSortOrder] = useState<"asc" | "desc">("asc");

  const [vendorSheetOpen, setVendorSheetOpen] = useState(false);
  const [vendorMode, setVendorMode] = useState<"add" | "edit">("add");
  const [vendorEditId, setVendorEditId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [vendorBusy, setVendorBusy] = useState(false);

  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<"add" | "edit">("add");
  const [categoryEditId, setCategoryEditId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryFullName, setCategoryFullName] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("vendors_page", String(vendorsPage));
    params.set("vendors_limit", String(vendorsLimit));
    if (vendorsSortBy) {
      params.set("vendors_sort_by", vendorsSortBy);
      params.set("vendors_sort_order", vendorsSortOrder);
    }
    params.set("categories_page", String(categoriesPage));
    params.set("categories_limit", String(categoriesLimit));
    if (categoriesSortBy) {
      params.set("categories_sort_by", categoriesSortBy);
      params.set("categories_sort_order", categoriesSortOrder);
    }
    const res = await fetch(`/api/admin/vendors-categories/page-data?${params}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      vendors: Vendor[];
      vendorsTotal: number;
      categories: Category[];
      categoriesTotal: number;
    };
    setVendors(data.vendors ?? []);
    setVendorsTotal(data.vendorsTotal ?? 0);
    setCategories(data.categories ?? []);
    setCategoriesTotal(data.categoriesTotal ?? 0);
  }, [
    vendorsPage,
    vendorsLimit,
    vendorsSortBy,
    vendorsSortOrder,
    categoriesPage,
    categoriesLimit,
    categoriesSortBy,
    categoriesSortOrder,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchData()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          notify.error("Failed to load data");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  function openAddVendor() {
    setVendorMode("add");
    setVendorEditId(null);
    setVendorName("");
    setVendorSheetOpen(true);
  }

  function openEditVendor(v: Vendor) {
    setVendorMode("edit");
    setVendorEditId(v.id);
    setVendorName(v.name);
    setVendorSheetOpen(true);
  }

  async function saveVendor() {
    if (!canManage) return;
    if (!vendorName.trim()) {
      notify.error("Name is required");
      return;
    }
    setVendorBusy(true);
    try {
      const url =
        vendorMode === "edit" && vendorEditId
          ? `/api/admin/vendors/${vendorEditId}`
          : "/api/admin/vendors";
      const method = vendorMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: vendorName.trim() }),
      });
      const data = (await res.json()) as Vendor & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save vendor");
        return;
      }
      if (vendorMode === "add") {
        setVendors((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setVendorsTotal((prev) => prev + 1);
      } else {
        setVendors((prev) =>
          prev.map((v) => (v.id === vendorEditId ? { ...v, ...data } : v))
        );
      }
      setVendorSheetOpen(false);
      notify.success(vendorMode === "add" ? "Vendor added." : "Vendor updated.");
    } catch {
      notify.error("Failed to save vendor");
    } finally {
      setVendorBusy(false);
    }
  }

  async function deleteVendor(v: Vendor) {
    if (!canManage) return;
    if (v._count && v._count.productItems > 0) {
      notify.error(`Cannot delete: ${v._count.productItems} product(s) use this vendor`);
      return;
    }
    if (!confirm(`Delete vendor "${v.name}"?`)) return;
    const res = await fetch(`/api/admin/vendors/${v.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to delete vendor");
      return;
    }
    setVendors((prev) => prev.filter((x) => x.id !== v.id));
    setVendorsTotal((prev) => Math.max(0, prev - 1));
    notify.success("Vendor deleted.");
  }

  function openAddCategory() {
    setCategoryMode("add");
    setCategoryEditId(null);
    setCategoryName("");
    setCategoryFullName("");
    setCategorySheetOpen(true);
  }

  function openEditCategory(c: Category) {
    setCategoryMode("edit");
    setCategoryEditId(c.id);
    setCategoryName(c.name);
    setCategoryFullName(c.fullName ?? "");
    setCategorySheetOpen(true);
  }

  async function saveCategory() {
    if (!canManage) return;
    if (!categoryName.trim()) {
      notify.error("Name is required");
      return;
    }
    setCategoryBusy(true);
    try {
      const url =
        categoryMode === "edit" && categoryEditId
          ? `/api/admin/categories/${categoryEditId}`
          : "/api/admin/categories";
      const method = categoryMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryName.trim(),
          fullName: categoryFullName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as Category & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save category");
        return;
      }
      if (categoryMode === "add") {
        setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setCategoriesTotal((prev) => prev + 1);
      } else {
        setCategories((prev) =>
          prev.map((c) => (c.id === categoryEditId ? { ...c, ...data } : c))
        );
      }
      setCategorySheetOpen(false);
      notify.success(categoryMode === "add" ? "Category added." : "Category updated.");
    } catch {
      notify.error("Failed to save category");
    } finally {
      setCategoryBusy(false);
    }
  }

  async function deleteCategory(c: Category) {
    if (!canManage) return;
    if (c._count && c._count.productItems > 0) {
      notify.error(`Cannot delete: ${c._count.productItems} product(s) use this category`);
      return;
    }
    if (!confirm(`Delete category "${c.name}"?`)) return;
    const res = await fetch(`/api/admin/categories/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to delete category");
      return;
    }
    setCategories((prev) => prev.filter((x) => x.id !== c.id));
    setCategoriesTotal((prev) => Math.max(0, prev - 1));
    notify.success("Category deleted.");
  }

  const vendorOriginal =
    vendorMode === "edit" && vendorEditId
      ? vendors.find((vendor) => vendor.id === vendorEditId)
      : null;
  const vendorHasChanges =
    vendorMode === "add"
      ? vendorName.trim().length > 0
      : vendorName.trim() !== (vendorOriginal?.name ?? "").trim();

  const categoryOriginal =
    categoryMode === "edit" && categoryEditId
      ? categories.find((category) => category.id === categoryEditId)
      : null;
  const categoryHasChanges =
    categoryMode === "add"
      ? categoryName.trim().length > 0
      : categoryName.trim() !== (categoryOriginal?.name ?? "").trim() ||
        categoryFullName.trim() !== (categoryOriginal?.fullName ?? "").trim();

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
            <Boxes className="size-3.5" aria-hidden />
            Catalog Controls
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Catalog Metadata</h2>
            <p className="text-sm text-muted-foreground">
              Keep product mapping clean by managing vendor and category references in one place.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vendors
            </p>
            <p className="mt-2 text-2xl font-semibold">{vendorsTotal}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total vendor records available.</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Categories
            </p>
            <p className="mt-2 text-2xl font-semibold">{categoriesTotal}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total category records available.</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active Tab
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {activeTab === "vendors" ? "Vendors" : "Categories"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Switch tabs to manage data.</p>
          </div>
        </div>
      </section>

      <div className="inline-flex rounded-xl border bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("vendors")}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "vendors"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Tag className="size-4" aria-hidden />
            Vendors
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("categories")}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "categories"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Boxes className="size-4" aria-hidden />
            Categories
          </span>
        </button>
      </div>

      {loading ? (
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent>
            <TableSkeleton columns={3} rows={8} />
          </CardContent>
        </Card>
      ) : activeTab === "vendors" ? (
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Vendors</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Vendors are added automatically from Shopify webhooks. You can also add or edit
                  them manually.
                </p>
              </div>
              {canManage && (
                <Button onClick={openAddVendor} size="sm">
                  <Plus className="size-4" aria-hidden />
                  Add vendor
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {vendors.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center">
                <p className="text-sm font-medium">No vendors found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vendor records will appear here after Shopify sync or manual creation.
                </p>
              </div>
            ) : (
              <>
              <div className="mb-3 flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span>Showing {vendors.length} vendors on this page</span>
                <span>Total records: {vendorsTotal}</span>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <SortableColumnHeader
                        label="Name"
                        sortKey="name"
                        currentSort={vendorsSortBy || undefined}
                        currentOrder={vendorsSortOrder}
                        onSort={(k, o) => {
                          setVendorsSortBy(k);
                          setVendorsSortOrder(o);
                          setVendorsPage(1);
                        }}
                      />
                      <SortableColumnHeader
                        label="Items"
                        sortKey="items"
                        currentSort={vendorsSortBy || undefined}
                        currentOrder={vendorsSortOrder}
                        onSort={(k, o) => {
                          setVendorsSortBy(k);
                          setVendorsSortOrder(o);
                          setVendorsPage(1);
                        }}
                        align="right"
                      />
                      {canManage && <th className="w-24 px-4 py-2 text-right font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((v) => (
                      <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{v.name}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {v._count !== undefined ? `${v._count.productItems} items` : "—"}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditVendor(v)}
                                aria-label="Edit vendor"
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteVendor(v)}
                                disabled={v._count && v._count.productItems > 0}
                                aria-label="Delete vendor"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vendorsTotal > 0 && (
                <Pagination
                  page={vendorsPage}
                  limit={vendorsLimit}
                  total={vendorsTotal}
                  onPageChange={setVendorsPage}
                  onLimitChange={(l) => {
                    setVendorsLimit(l);
                    setVendorsPage(1);
                  }}
                  limitOptions={[10, 25, 50, 100]}
                  className="mt-4"
                />
              )}
            </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Categories</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Categories are added automatically from Shopify webhooks. You can also add or edit
                  them manually.
                </p>
              </div>
              {canManage && (
                <Button onClick={openAddCategory} size="sm">
                  <Plus className="size-4" aria-hidden />
                  Add category
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center">
                <p className="text-sm font-medium">No categories found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Category records will appear here after Shopify sync or manual creation.
                </p>
              </div>
            ) : (
              <>
              <div className="mb-3 flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span>Showing {categories.length} categories on this page</span>
                <span>Total records: {categoriesTotal}</span>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <SortableColumnHeader
                        label="Name"
                        sortKey="name"
                        currentSort={categoriesSortBy || undefined}
                        currentOrder={categoriesSortOrder}
                        onSort={(k, o) => {
                          setCategoriesSortBy(k);
                          setCategoriesSortOrder(o);
                          setCategoriesPage(1);
                        }}
                      />
                      <SortableColumnHeader
                        label="Full name"
                        sortKey="full_name"
                        currentSort={categoriesSortBy || undefined}
                        currentOrder={categoriesSortOrder}
                        onSort={(k, o) => {
                          setCategoriesSortBy(k);
                          setCategoriesSortOrder(o);
                          setCategoriesPage(1);
                        }}
                      />
                      <SortableColumnHeader
                        label="Items"
                        sortKey="items"
                        currentSort={categoriesSortBy || undefined}
                        currentOrder={categoriesSortOrder}
                        onSort={(k, o) => {
                          setCategoriesSortBy(k);
                          setCategoriesSortOrder(o);
                          setCategoriesPage(1);
                        }}
                        align="right"
                      />
                      {canManage && <th className="w-24 px-4 py-2 text-right font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.fullName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {c._count !== undefined ? `${c._count.productItems} items` : "—"}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditCategory(c)}
                                aria-label="Edit category"
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteCategory(c)}
                                disabled={c._count && c._count.productItems > 0}
                                aria-label="Delete category"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {categoriesTotal > 0 && (
                <Pagination
                  page={categoriesPage}
                  limit={categoriesLimit}
                  total={categoriesTotal}
                  onPageChange={setCategoriesPage}
                  onLimitChange={(l) => {
                    setCategoriesLimit(l);
                    setCategoriesPage(1);
                  }}
                  limitOptions={[10, 25, 50, 100]}
                  className="mt-4"
                />
              )}
            </>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={vendorSheetOpen} onOpenChange={setVendorSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{vendorMode === "add" ? "Add Vendor" : "Edit Vendor"}</SheetTitle>
            <SheetDescription>
              {vendorMode === "add"
                ? "Create a vendor for cleaner product mapping."
                : "Update the vendor name used by synced products."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {vendorMode === "add" ? "New vendor" : "Editing vendor"}
              </p>
              <p className="mt-1 text-sm">
                {vendorMode === "add"
                  ? "Add a clear vendor name used by your team and reports."
                  : `Current: ${vendorOriginal?.name ?? "Unknown vendor"}`}
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="vendor-name" className="text-sm font-medium">
                Vendor name
              </label>
              <Input
                id="vendor-name"
                placeholder="e.g. L'Oreal, CeraVe, NYX"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                disabled={vendorBusy}
                maxLength={150}
              />
              <p className="text-xs text-muted-foreground">
                Keep names consistent to avoid duplicate vendor records.
              </p>
            </div>
          </div>
          <SheetFooter className="sticky bottom-0 border-t bg-background/95 py-3 backdrop-blur">
            <Button variant="outline" onClick={() => setVendorSheetOpen(false)} disabled={vendorBusy}>
              Cancel
            </Button>
            <Button
              onClick={saveVendor}
              disabled={vendorBusy || !vendorName.trim() || !vendorHasChanges}
            >
              {vendorBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                vendorMode === "add" ? "Add vendor" : "Save changes"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{categoryMode === "add" ? "Add Category" : "Edit Category"}</SheetTitle>
            <SheetDescription>
              {categoryMode === "add"
                ? "Create a category for better product grouping."
                : "Update the category label and hierarchy path."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {categoryMode === "add" ? "New category" : "Editing category"}
              </p>
              <p className="mt-1 text-sm">
                {categoryMode === "add"
                  ? "Use a short, recognizable name first."
                  : `Current: ${categoryOriginal?.name ?? "Unknown category"}`}
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="category-name" className="mb-1 block text-sm font-medium">
                Name
              </label>
              <Input
                id="category-name"
                placeholder="Category name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                disabled={categoryBusy}
                maxLength={150}
              />
              <p className="text-xs text-muted-foreground">
                This name appears in filters and tables.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="category-full-name" className="mb-1 block text-sm font-medium">
                Full name (optional)
              </label>
              <Input
                id="category-full-name"
                placeholder="e.g. Health & Beauty > Skin Care > Face Serums"
                value={categoryFullName}
                onChange={(e) => setCategoryFullName(e.target.value)}
                disabled={categoryBusy}
                maxLength={250}
              />
              <p className="text-xs text-muted-foreground">
                Use the full path when you need deeper category hierarchy.
              </p>
            </div>
          </div>
          <SheetFooter className="sticky bottom-0 border-t bg-background/95 py-3 backdrop-blur">
            <Button
              variant="outline"
              onClick={() => setCategorySheetOpen(false)}
              disabled={categoryBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={saveCategory}
              disabled={categoryBusy || !categoryName.trim() || !categoryHasChanges}
            >
              {categoryBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                categoryMode === "add" ? "Add category" : "Save changes"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
