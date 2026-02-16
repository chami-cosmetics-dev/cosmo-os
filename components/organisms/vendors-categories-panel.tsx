"use client";

import { useState, useEffect } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

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

  async function fetchData() {
    const res = await fetch("/api/admin/vendors-categories/page-data");
    if (!res.ok) return;
    const data = (await res.json()) as {
      vendors: Vendor[];
      categories: Category[];
    };
    setVendors(data.vendors ?? []);
    setCategories(data.categories ?? []);
  }

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
  }, []);

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
    notify.success("Category deleted.");
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setActiveTab("vendors")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "vendors"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Vendors
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("categories")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "categories"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Categories
        </button>
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
              <p className="text-muted-foreground py-4 text-sm">No vendors yet.</p>
            ) : (
              <ul className="space-y-2">
                {vendors.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <span className="font-medium">{v.name}</span>
                      {v._count !== undefined && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({v._count.productItems} items)
                        </span>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditVendor(v)}
                          aria-label="Edit vendor"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteVendor(v)}
                          disabled={v._count && v._count.productItems > 0}
                          aria-label="Delete vendor"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
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
              <p className="text-muted-foreground py-4 text-sm">No categories yet.</p>
            ) : (
              <ul className="space-y-2">
                {categories.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {c.fullName && (
                        <span className="text-muted-foreground block text-xs">{c.fullName}</span>
                      )}
                      {c._count !== undefined && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({c._count.productItems} items)
                        </span>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditCategory(c)}
                          aria-label="Edit category"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteCategory(c)}
                          disabled={c._count && c._count.productItems > 0}
                          aria-label="Delete category"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
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
    </div>
  );
}
