"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderTree, Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type Vendor = { id: string; name: string; _count?: { productItems: number } };
type Category = {
  id: string;
  name: string;
  fullName: string | null;
  _count?: { productItems: number };
};
type PendingDelete =
  | { type: "vendor" | "category"; id: string; name: string; itemCount: number }
  | null;

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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  function openEditVendor(vendor: Vendor) {
    setVendorMode("edit");
    setVendorEditId(vendor.id);
    setVendorName(vendor.name);
    setVendorSheetOpen(true);
  }

  async function saveVendor() {
    if (!canManage) return;
    if (!vendorName.trim()) return notify.error("Name is required");
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
      if (!res.ok) return notify.error(data.error ?? "Failed to save vendor");
      if (vendorMode === "add") {
        setVendors((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setVendorsTotal((prev) => prev + 1);
      } else {
        setVendors((prev) =>
          prev.map((vendor) => (vendor.id === vendorEditId ? { ...vendor, ...data } : vendor))
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

  function requestDeleteVendor(vendor: Vendor) {
    if (!canManage) return;
    if (vendor._count && vendor._count.productItems > 0) {
      notify.error(`Cannot delete: ${vendor._count.productItems} product(s) use this vendor`);
      return;
    }
    setPendingDelete({
      type: "vendor",
      id: vendor.id,
      name: vendor.name,
      itemCount: vendor._count?.productItems ?? 0,
    });
  }

  function openAddCategory() {
    setCategoryMode("add");
    setCategoryEditId(null);
    setCategoryName("");
    setCategoryFullName("");
    setCategorySheetOpen(true);
  }

  function openEditCategory(category: Category) {
    setCategoryMode("edit");
    setCategoryEditId(category.id);
    setCategoryName(category.name);
    setCategoryFullName(category.fullName ?? "");
    setCategorySheetOpen(true);
  }

  async function saveCategory() {
    if (!canManage) return;
    if (!categoryName.trim()) return notify.error("Name is required");
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
      if (!res.ok) return notify.error(data.error ?? "Failed to save category");
      if (categoryMode === "add") {
        setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setCategoriesTotal((prev) => prev + 1);
      } else {
        setCategories((prev) =>
          prev.map((category) =>
            category.id === categoryEditId ? { ...category, ...data } : category
          )
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

  function requestDeleteCategory(category: Category) {
    if (!canManage) return;
    if (category._count && category._count.productItems > 0) {
      notify.error(`Cannot delete: ${category._count.productItems} product(s) use this category`);
      return;
    }
    setPendingDelete({
      type: "category",
      id: category.id,
      name: category.name,
      itemCount: category._count?.productItems ?? 0,
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      if (pendingDelete.type === "vendor") {
        const res = await fetch(`/api/admin/vendors/${pendingDelete.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          return notify.error(data.error ?? "Failed to delete vendor");
        }
        setVendors((prev) => prev.filter((entry) => entry.id !== pendingDelete.id));
        setVendorsTotal((prev) => Math.max(0, prev - 1));
        notify.success("Vendor deleted.");
      } else {
        const res = await fetch(`/api/admin/categories/${pendingDelete.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          return notify.error(data.error ?? "Failed to delete category");
        }
        setCategories((prev) => prev.filter((entry) => entry.id !== pendingDelete.id));
        setCategoriesTotal((prev) => Math.max(0, prev - 1));
        notify.success("Category deleted.");
      }
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Products
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <FolderTree className="size-5 text-muted-foreground" />
          Vendors & Categories
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Manage the vendor and category records that support product sync, filtering, and reporting.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Vendors</p>
          <p className="mt-2 text-sm font-semibold">{vendorsTotal.toLocaleString("en-LK")}</p>
          <p className="text-muted-foreground mt-1 text-xs">Vendor labels available to product items and catalog filters.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Categories</p>
          <p className="mt-2 text-sm font-semibold">{categoriesTotal.toLocaleString("en-LK")}</p>
          <p className="text-muted-foreground mt-1 text-xs">Category records used for grouping, navigation, and reporting.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Access</p>
          <p className="mt-2 text-sm font-semibold">{canManage ? "Manage enabled" : "Read only"}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {canManage ? "Add, update, and remove records from this page." : "You can review the catalog structure here, but editing is disabled."}
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-1 shadow-xs">
        <Button type="button" size="sm" variant={activeTab === "vendors" ? "default" : "ghost"} onClick={() => setActiveTab("vendors")} className={activeTab === "vendors" ? "shadow-[0_10px_24px_-18px_var(--primary)]" : ""}>
          Vendors ({vendorsTotal})
        </Button>
        <Button type="button" size="sm" variant={activeTab === "categories" ? "default" : "ghost"} onClick={() => setActiveTab("categories")} className={activeTab === "categories" ? "shadow-[0_10px_24px_-18px_var(--primary)]" : ""}>
          Categories ({categoriesTotal})
        </Button>
      </div>

      {loading ? (
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent>
            <TableSkeleton columns={3} rows={8} />
          </CardContent>
        </Card>
      ) : activeTab === "vendors" ? (
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Store className="size-5 text-muted-foreground" />
                  Vendors
                </CardTitle>
                <p className="text-muted-foreground text-sm">Vendors are synced from Shopify webhooks, with manual add and edit support for cleanup.</p>
                <p className="text-muted-foreground mt-1 text-xs">Showing {vendors.length} of {vendorsTotal} vendors.</p>
              </div>
              {canManage ? (
                <Button onClick={openAddVendor} size="sm" className="shadow-[0_10px_24px_-18px_var(--primary)]">
                  <Plus className="size-4" aria-hidden />
                  Add Vendor
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {vendors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/85 p-8 text-center">
                <p className="text-muted-foreground text-sm">No vendors yet.</p>
                {canManage ? (
                  <Button onClick={openAddVendor} size="sm" variant="outline" className="mt-3 border-border/70 bg-background/85 hover:bg-secondary/10">
                    <Plus className="size-4" aria-hidden />
                    Add First Vendor
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/90 shadow-xs">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
                        <SortableColumnHeader label="Name" sortKey="name" currentSort={vendorsSortBy || undefined} currentOrder={vendorsSortOrder} onSort={(key, order) => { setVendorsSortBy(key); setVendorsSortOrder(order); setVendorsPage(1); }} />
                        <SortableColumnHeader label="Items" sortKey="items" currentSort={vendorsSortBy || undefined} currentOrder={vendorsSortOrder} onSort={(key, order) => { setVendorsSortBy(key); setVendorsSortOrder(order); setVendorsPage(1); }} align="right" />
                        {canManage ? <th className="w-24 px-4 py-2 text-right font-medium">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((vendor) => (
                        <tr key={vendor.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/10">
                          <td className="px-4 py-3 font-medium">{vendor.name}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {vendor._count !== undefined ? `${vendor._count.productItems} items` : "-"}
                          </td>
                          {canManage ? (
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="outline" size="sm" onClick={() => openEditVendor(vendor)} aria-label="Edit vendor" className="border-border/70 bg-background/85 hover:bg-secondary/10">
                                  <Pencil className="size-4" />
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => requestDeleteVendor(vendor)} disabled={Boolean(vendor._count && vendor._count.productItems > 0)} aria-label="Delete vendor" className="border-border/70 bg-background/85 hover:bg-destructive/10">
                                  <Trash2 className="size-4" />
                                  Delete
                                </Button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {vendorsTotal > 0 ? (
                  <Pagination page={vendorsPage} limit={vendorsLimit} total={vendorsTotal} onPageChange={setVendorsPage} onLimitChange={(newLimit) => { setVendorsLimit(newLimit); setVendorsPage(1); }} limitOptions={[10, 25, 50, 100]} className="mt-4" />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderTree className="size-5 text-muted-foreground" />
                  Categories
                </CardTitle>
                <p className="text-muted-foreground text-sm">Categories are synced from Shopify webhooks, with manual controls for cleanup and naming.</p>
                <p className="text-muted-foreground mt-1 text-xs">Showing {categories.length} of {categoriesTotal} categories.</p>
              </div>
              {canManage ? (
                <Button onClick={openAddCategory} size="sm" className="shadow-[0_10px_24px_-18px_var(--primary)]">
                  <Plus className="size-4" aria-hidden />
                  Add Category
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/85 p-8 text-center">
                <p className="text-muted-foreground text-sm">No categories yet.</p>
                {canManage ? (
                  <Button onClick={openAddCategory} size="sm" variant="outline" className="mt-3 border-border/70 bg-background/85 hover:bg-secondary/10">
                    <Plus className="size-4" aria-hidden />
                    Add First Category
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/90 shadow-xs">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
                        <SortableColumnHeader label="Name" sortKey="name" currentSort={categoriesSortBy || undefined} currentOrder={categoriesSortOrder} onSort={(key, order) => { setCategoriesSortBy(key); setCategoriesSortOrder(order); setCategoriesPage(1); }} />
                        <SortableColumnHeader label="Full name" sortKey="full_name" currentSort={categoriesSortBy || undefined} currentOrder={categoriesSortOrder} onSort={(key, order) => { setCategoriesSortBy(key); setCategoriesSortOrder(order); setCategoriesPage(1); }} />
                        <SortableColumnHeader label="Items" sortKey="items" currentSort={categoriesSortBy || undefined} currentOrder={categoriesSortOrder} onSort={(key, order) => { setCategoriesSortBy(key); setCategoriesSortOrder(order); setCategoriesPage(1); }} align="right" />
                        {canManage ? <th className="w-24 px-4 py-2 text-right font-medium">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((category) => (
                        <tr key={category.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/10">
                          <td className="px-4 py-3 font-medium">{category.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{category.fullName ?? "-"}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {category._count !== undefined ? `${category._count.productItems} items` : "-"}
                          </td>
                          {canManage ? (
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="outline" size="sm" onClick={() => openEditCategory(category)} aria-label="Edit category" className="border-border/70 bg-background/85 hover:bg-secondary/10">
                                  <Pencil className="size-4" />
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => requestDeleteCategory(category)} disabled={Boolean(category._count && category._count.productItems > 0)} aria-label="Delete category" className="border-border/70 bg-background/85 hover:bg-destructive/10">
                                  <Trash2 className="size-4" />
                                  Delete
                                </Button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {categoriesTotal > 0 ? (
                  <Pagination page={categoriesPage} limit={categoriesLimit} total={categoriesTotal} onPageChange={setCategoriesPage} onLimitChange={(newLimit) => { setCategoriesLimit(newLimit); setCategoriesPage(1); }} limitOptions={[10, 25, 50, 100]} className="mt-4" />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={vendorSheetOpen} onOpenChange={setVendorSheetOpen}>
        <SheetContent className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))]">
          <SheetHeader>
            <SheetTitle>{vendorMode === "add" ? "Add Vendor" : "Edit Vendor"}</SheetTitle>
            <SheetDescription>Enter the vendor name used across product items and product filters.</SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <Input placeholder="Vendor name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} disabled={vendorBusy} className="border-border/70 bg-background/90" />
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setVendorSheetOpen(false)} disabled={vendorBusy} className="border-border/70 bg-background/85 hover:bg-secondary/10">Cancel</Button>
            <Button onClick={saveVendor} disabled={vendorBusy} className="shadow-[0_10px_24px_-18px_var(--primary)]">
              {vendorBusy ? <><Loader2 className="size-4 animate-spin" aria-hidden />Saving...</> : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))]">
          <SheetHeader>
            <SheetTitle>{categoryMode === "add" ? "Add Category" : "Edit Category"}</SheetTitle>
            <SheetDescription>Enter the category name and optional full path.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input placeholder="Category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} disabled={categoryBusy} className="border-border/70 bg-background/90" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Full name (optional)</label>
              <Input placeholder="e.g. Health & Beauty > Skin Care > Face Serums" value={categoryFullName} onChange={(event) => setCategoryFullName(event.target.value)} disabled={categoryBusy} className="border-border/70 bg-background/90" />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCategorySheetOpen(false)} disabled={categoryBusy} className="border-border/70 bg-background/85 hover:bg-secondary/10">Cancel</Button>
            <Button onClick={saveCategory} disabled={categoryBusy} className="shadow-[0_10px_24px_-18px_var(--primary)]">
              {categoryBusy ? <><Loader2 className="size-4 animate-spin" aria-hidden />Saving...</> : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open && !deleteBusy) setPendingDelete(null); }}>
        <AlertDialogContent className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.type === "vendor" ? "Vendor" : "Category"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. {pendingDelete ? `"${pendingDelete.name}"` : "This record"} will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy} className="border-border/70 bg-background/85 hover:bg-secondary/10">Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? <><Loader2 className="size-4 animate-spin" aria-hidden />Deleting...</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
