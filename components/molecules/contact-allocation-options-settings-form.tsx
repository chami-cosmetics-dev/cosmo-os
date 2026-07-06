"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider";
import { notify } from "@/lib/notify";

type OptionItem = {
  id: string;
  type: string;
  value: string;
  createdAt: string;
};

const OPTION_TYPES = [
  { key: "serviceProvider", label: "Service Provider" },
  { key: "district", label: "District" },
  { key: "town", label: "Town" },
  { key: "origin", label: "Origin" },
  { key: "customerType", label: "Customer Type" },
  { key: "category", label: "Category" },
] as const;

type OptionTypeKey = (typeof OPTION_TYPES)[number]["key"];
const COLLAPSED_LIMIT = 5;

interface ContactAllocationOptionsSettingsFormProps {
  canEdit: boolean;
}

export function ContactAllocationOptionsSettingsForm({
  canEdit,
}: ContactAllocationOptionsSettingsFormProps) {
  const { confirm } = useConfirmationDialog();
  const [items, setItems] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState<OptionTypeKey>("serviceProvider");
  const [newValue, setNewValue] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [searchByType, setSearchByType] = useState<Record<string, string>>({});
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  async function loadOptions() {
    try {
      const res = await fetch("/api/admin/settings/contact-allocation-options");
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to load options");
        return;
      }
      const data = (await res.json()) as OptionItem[];
      setItems(data);
      setSelectedIds((current) => {
        const validIds = new Set(data.map((item) => item.id));
        return new Set([...current].filter((id) => validIds.has(id)));
      });
    } catch {
      notify.error("Failed to load options");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newValue.trim()) return;

    setBusyKey("add");
    try {
      const res = await fetch("/api/admin/settings/contact-allocation-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, value: newValue.trim() }),
      });

      const data = (await res.json()) as OptionItem & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to add option");
        return;
      }

      setItems((prev) =>
        [...prev, data].sort((a, b) =>
          a.type.localeCompare(b.type) || a.value.localeCompare(b.value)
        )
      );
      setNewValue("");
      notify.success("Option added.");
    } catch {
      notify.error("Failed to add option");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(item: OptionItem) {
    const confirmed = await confirm({
      title: "Delete option",
      description: `Remove "${item.value}" from ${OPTION_TYPES.find((t) => t.key === item.type)?.label ?? item.type}?`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyKey(`delete-${item.id}`);
    try {
      const res = await fetch(
        `/api/admin/settings/contact-allocation-options/${item.id}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to delete option");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      notify.success("Option deleted.");
    } catch {
      notify.error("Failed to delete option");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteSelected(typeKey: OptionTypeKey, ids: string[]) {
    if (ids.length === 0) return;
    const optType = OPTION_TYPES.find((type) => type.key === typeKey);
    const confirmed = await confirm({
      title: "Delete selected options",
      description: `Remove ${ids.length} selected ${optType?.label ?? "option"} value${ids.length === 1 ? "" : "s"}?`,
      confirmLabel: "Delete selected",
      variant: "destructive",
    });
    if (!confirmed) return;

    setBusyKey(`delete-selected-${typeKey}`);
    try {
      const res = await fetch("/api/admin/settings/contact-allocation-options", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to delete selected options");
        return;
      }
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
      setSelectedIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      const deleted = data.deleted ?? ids.length;
      notify.success(`Deleted ${deleted} option${deleted === 1 ? "" : "s"}.`);
    } catch {
      notify.error("Failed to delete selected options");
    } finally {
      setBusyKey(null);
    }
  }

  function toggleSelection(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleMany(ids: string[], checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  function toggleExpanded(typeKey: OptionTypeKey) {
    setExpandedTypes((current) => {
      const next = new Set(current);
      if (next.has(typeKey)) next.delete(typeKey);
      else next.add(typeKey);
      return next;
    });
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !importFile) return;

    setBusyKey("import");
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/admin/settings/contact-allocation-options/import", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        error?: string;
        summary?: { parsed: number; created: number; skipped: number };
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to import options");
        return;
      }
      setImportFile(null);
      const input = document.getElementById("contact-allocation-options-csv") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadOptions();
      const summary = data.summary;
      notify.success(
        summary
          ? `Imported ${summary.created} option${summary.created === 1 ? "" : "s"}. Skipped ${summary.skipped}.`
          : "Import completed."
      );
    } catch {
      notify.error("Failed to import options");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Add Option</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:gap-x-3 sm:gap-y-1.5">
              {/* Desktop-only label row */}
              <label className="hidden text-sm font-medium sm:block">Field</label>
              <label className="hidden text-sm font-medium sm:block">Value</label>
              <div className="hidden sm:block" aria-hidden="true" />

              {/* Field control — div is layout-transparent to grid on sm */}
              <div className="space-y-1.5 sm:contents">
                <label className="text-sm font-medium sm:hidden">Field</label>
                <Select
                  value={newType}
                  onValueChange={(v) => setNewType(v as OptionTypeKey)}
                  disabled={isBusy}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPTION_TYPES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value control */}
              <div className="space-y-1.5 sm:contents">
                <label className="text-sm font-medium sm:hidden">Value</label>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="e.g. Dialog, Colombo, Website…"
                  disabled={isBusy}
                  maxLength={100}
                />
              </div>

              <Button
                type="submit"
                disabled={isBusy || !newValue.trim()}
                className="w-full sm:w-auto"
              >
                {busyKey === "add" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 size-4" />
                )}
                Add
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Import Options</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleImport} className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                <p>
                  Upload a CSV with columns: S. Provider, District, Town, Origin, Category, Cus. Type.
                </p>
                <p className="mt-1">
                  Put each option value in the matching column. Empty cells are ignored and duplicates are skipped.
                </p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="space-y-1.5 lg:flex-1">
                  <label className="text-sm font-medium" htmlFor="contact-allocation-options-csv">
                    CSV file
                  </label>
                  <Input
                    id="contact-allocation-options-csv"
                    type="file"
                    accept=".csv,text/csv"
                    disabled={isBusy}
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <Button type="button" variant="outline" asChild>
                  <a href="/api/admin/settings/contact-allocation-options/import-template">
                    <Download className="mr-2 size-4" />
                    Download Format
                  </a>
                </Button>
                <Button type="submit" disabled={isBusy || !importFile}>
                  {busyKey === "import" ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-4" />
                  )}
                  Import CSV
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {OPTION_TYPES.map((optType) => {
        const typeItems = items.filter((i) => i.type === optType.key);
        const search = searchByType[optType.key] ?? "";
        const filteredItems = search.trim()
          ? typeItems.filter((item) =>
              item.value.toLowerCase().includes(search.trim().toLowerCase())
            )
          : typeItems;
        const isExpanded = expandedTypes.has(optType.key);
        const visibleItems =
          isExpanded || search.trim()
            ? filteredItems
            : filteredItems.slice(0, COLLAPSED_LIMIT);
        const filteredIds = filteredItems.map((item) => item.id);
        const selectedFilteredIds = filteredIds.filter((id) => selectedIds.has(id));
        const hasMoreThanFive = filteredItems.length > COLLAPSED_LIMIT && !search.trim();
        return (
          <Card key={optType.key}>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle>{optType.label}</CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{typeItems.length} total</span>
                  {selectedFilteredIds.length > 0 && (
                    <span>{selectedFilteredIds.length} selected</span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : typeItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No options configured. Add one above.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <div className="relative lg:max-w-sm lg:flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) =>
                          setSearchByType((current) => ({
                            ...current,
                            [optType.key]: event.target.value,
                          }))
                        }
                        placeholder={`Search ${optType.label.toLowerCase()}`}
                        className="pl-9"
                      />
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toggleMany(
                              filteredIds,
                              selectedFilteredIds.length !== filteredIds.length
                            )
                          }
                          disabled={filteredIds.length === 0 || isBusy}
                        >
                          {selectedFilteredIds.length === filteredIds.length
                            ? "Clear selected"
                            : "Select all"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            handleDeleteSelected(optType.key, selectedFilteredIds)
                          }
                          disabled={selectedFilteredIds.length === 0 || isBusy}
                        >
                          {busyKey === `delete-selected-${optType.key}` && (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          )}
                          Delete selected
                        </Button>
                      </div>
                    )}
                  </div>

                  {filteredItems.length === 0 ? (
                    <p className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
                      No matching options.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {visibleItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {canEdit && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(item.id)}
                                onChange={(event) =>
                                  toggleSelection(item.id, event.target.checked)
                                }
                                disabled={isBusy}
                                className="size-4 shrink-0 accent-primary"
                                aria-label={`Select ${item.value}`}
                              />
                            )}
                            <span className="truncate">{item.value}</span>
                          </div>
                          {canEdit && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(item)}
                              disabled={busyKey === `delete-${item.id}`}
                            >
                              {busyKey === `delete-${item.id}` ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {hasMoreThanFive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleExpanded(optType.key)}
                    >
                      {isExpanded ? "Show first 5" : `Show all ${filteredItems.length}`}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
