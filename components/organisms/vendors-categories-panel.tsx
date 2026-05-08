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

type PendingDelete =
  | {
      type: "vendor" | "category";
      id: string;
      name: string;
      itemCount: number;
    }
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

  function requestDeleteVendor(v: Vendor) {
    if (!canManage) return;
    if (v._count && v._count.productItems > 0) {
      notify.error(`Cannot delete: ${v._count.productItems} product(s) use this vendor`);
      return;
    }
    setPendingDelete({
      type: "vendor",
      id: v.id,
      name: v.name,
      itemCount: v._count?.productItems ?? 0,
    });
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

  function requestDeleteCategory(c: Category) {
    if (!canManage) return;
    if (c._count && c._count.productItems > 0) {
      notify.error(`Cannot delete: ${c._count.productItems} product(s) use this category`);
      return;
    }
    setPendingDelete({
      type: "category",
      id: c.id,
      name: c.name,
      itemCount: c._count?.productItems ?? 0,
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
          notify.error(data.error ?? "Failed to delete vendor");
          return;
        }
        setVendors((prev) => prev.filter((x) => x.id !== pendingDelete.id));
        setVendorsTotal((prev) => Math.max(0, prev - 1));
        notify.success("Vendor deleted.");
      } else {
        const res = await fetch(`/api/admin/categories/${pendingDelete.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          notify.error(data.error ?? "Failed to delete category");
          return;
        }
        setCategories((prev) => prev.filter((x) => x.id !== pendingDelete.id));
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
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Vendors & Categories</CardTitle>
          <p className="text-muted-foreground text-sm">
            Manage product classification data used by product items and filters.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Store className="size-4 text-muted-foreground" />
                Vendors
              </div>
              <p className="mt-1 text-2xl font-semibold">{vendorsTotal}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderTree className="size-4 text-muted-foreground" />
                Categories
              </div>
              <p className="mt-1 text-2xl font-semibold">{categoriesTotal}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="inline-flex rounded-md border bg-muted/30 p-1">
        <Button
          type="button"
          size="sm"
          variant={activeTab === "vendors" ? "default" : "ghost"}
          onClick={() => setActiveTab("vendors")}
        >
          Vendors ({vendorsTotal})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeTab === "categories" ? "default" : "ghost"}
          onClick={() => setActiveTab("categories")}
        >
          Categories ({categoriesTotal})
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent>
            <TableSkeleton columns={3} rows={8} />
          </CardContent>
        </Card>
      ) : activeTab === "vendors" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Vendors</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Vendors are added automatically from Shopify webhooks. You can also add or edit
                  them manually.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Showing {vendors.length} of {vendorsTotal} vendors.
                </p>
              </div>
              {canManage && (
                <Button onClick={openAddVendor} size="sm">
                  <Plus className="size-4" aria-hidden />
                  Add Vendor
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {vendors.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-muted-foreground text-sm">No vendors yet.</p>
                {canManage && (
                  <Button onClick={openAddVendor} size="sm" variant="outline" className="mt-3">
                    <Plus className="size-4" aria-hidden />
                    Add First Vendor
                  </Button>
                )}
              </div>
            ) : (
              <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
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
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditVendor(v)}
                                aria-label="Edit vendor"
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => requestDeleteVendor(v)}
                                disabled={v._count && v._count.productItems > 0}
                                aria-label="Delete vendor"
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Categories</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Categories are added automatically from Shopify webhooks. You can also add or edit
                  them manually.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Showing {categories.length} of {categoriesTotal} categories.
                </p>
              </div>
              {canManage && (
                <Button onClick={openAddCategory} size="sm">
                  <Plus className="size-4" aria-hidden />
                  Add Category
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-muted-foreground text-sm">No categories yet.</p>
                {canManage && (
                  <Button
                    onClick={openAddCategory}
                    size="sm"
                    variant="outline"
                    className="mt-3"
                  >
                    <Plus className="size-4" aria-hidden />
                    Add First Category
                  </Button>
                )}
              </div>
            ) : (
              <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
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
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditCategory(c)}
                                aria-label="Edit category"
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => requestDeleteCategory(c)}
                                disabled={c._count && c._count.productItems > 0}
                                aria-label="Delete category"
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
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{vendorMode === "add" ? "Add Vendor" : "Edit Vendor"}</SheetTitle>
            <SheetDescription>Enter the vendor name.</SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <Input
              placeholder="Vendor name"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              disabled={vendorBusy}
            />
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setVendorSheetOpen(false)} disabled={vendorBusy}>
              Cancel
            </Button>
            <Button onClick={saveVendor} disabled={vendorBusy}>
              {vendorBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{categoryMode === "add" ? "Add Category" : "Edit Category"}</SheetTitle>
            <SheetDescription>Enter the category name and optional full path.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <Input
                placeholder="Category name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                disabled={categoryBusy}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Full name (optional)</label>
              <Input
                placeholder="e.g. Health & Beauty > Skin Care > Face Serums"
                value={categoryFullName}
                onChange={(e) => setCategoryFullName(e.target.value)}
                disabled={categoryBusy}
              />
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setCategorySheetOpen(false)}
              disabled={categoryBusy}
            >
              Cancel
            </Button>
            <Button onClick={saveCategory} disabled={categoryBusy}>
              {categoryBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.type === "vendor" ? "Vendor" : "Category"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.{" "}
              {pendingDelete ? `"${pendingDelete.name}"` : "This record"} will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
