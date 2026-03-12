"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StickerPreviewCard } from "@/components/organisms/sticker-preview-card";
import { notify } from "@/lib/notify";

type SupplierOption = {
  id: string;
  name: string;
  code: string;
};

type LocationOption = {
  id: string;
  name: string;
  locationReference: string | null;
};

type ItemCatalogRow = {
  id: string;
  companyLocationId: string;
  sku: string | null;
  barcode: string | null;
  productTitle: string;
  variantTitle: string | null;
  price: string;
};

type ItemRow = {
  id: string;
  locationId: string;
  itemCode: string;
  itemName: string;
  unitPrice: string;
  quantity: string;
  manufactureDate: string;
  expireDate: string;
  age: string;
};

type BatchOption = {
  id: string;
  batchName: string;
  mode: "single" | "multiple" | "unassigned";
};

type BatchDetailsResponse = {
  supplierName?: string;
  companyName?: string;
  companyAddress?: string;
  items?: Array<{
    itemCode: string;
    itemName: string;
    unitPrice: string;
    quantity: number;
    manufactureDate: string;
    expireDate: string;
    locationId?: string | null;
    locationReference?: string | null;
    locationName?: string | null;
    locationAddress?: string | null;
    locationPhone?: string | null;
  }>;
  error?: string;
};

type BatchPreviewMeta = {
  supplierName: string;
  companyName: string;
  companyAddress: string;
  locationReference: string;
  locationAddress: string;
  locationPhone: string;
};

type LoadedBatchSnapshot = {
  batchId: string;
  locationId: string;
  mode: "multiple";
  rows: Array<{
    locationId: string;
    itemCode: string;
    itemName: string;
    unitPrice: string;
    quantity: string;
    manufactureDate: string;
    expireDate: string;
  }>;
};

interface StickerBatchClientProps {
  suppliers: SupplierOption[];
  locations: LocationOption[];
  itemCatalog: ItemCatalogRow[];
  initialBatches: BatchOption[];
  today: string;
}

const selectClassName = "";

const textareaClassName =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:text-sm";
const inlineChangedClass = "";
const ITEMS_DRAFT_STORAGE_KEY = "sticker_batch_items_draft_v1";

function createEmptyRow(id: string): ItemRow {
  return {
    id,
    locationId: "",
    itemCode: "",
    itemName: "",
    unitPrice: "",
    quantity: "",
    manufactureDate: "",
    expireDate: "",
    age: "",
  };
}

function formatToTwoDecimals(value: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(2);
}

function formatDateTyping(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDDMMYYYY(value: string) {
  const parts = value.split("/");
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  )
    return null;
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31)
    return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function computeAge(manufactureDate: string, expireDate: string) {
  const mfg = parseDDMMYYYY(manufactureDate);
  const exp = parseDDMMYYYY(expireDate);
  if (!mfg || !exp || exp < mfg) return "";

  let months =
    (exp.getFullYear() - mfg.getFullYear()) * 12 +
    (exp.getMonth() - mfg.getMonth());
  if (exp.getDate() < mfg.getDate()) months -= 1;
  if (months < 0) return "";

  const yearsPart = Math.floor(months / 12);
  const monthsPart = months % 12;
  return `${yearsPart}Y ${monthsPart}M`;
}

function getInlineChangeClass(value: string) {
  return value.trim() ? inlineChangedClass : "";
}

function formatDateFromApi(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function StickerBatchClient({
  suppliers,
  locations,
  itemCatalog,
  initialBatches,
  today,
}: StickerBatchClientProps) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [batchDate, setBatchDate] = useState(today);
  const [remark, setRemark] = useState("");
  const [batches, setBatches] = useState<BatchOption[]>(initialBatches);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [rowsToAdd, setRowsToAdd] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [isPreviewLifted, setIsPreviewLifted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [loadedSnapshot, setLoadedSnapshot] = useState<LoadedBatchSnapshot | null>(null);
  const [previewMeta, setPreviewMeta] = useState<BatchPreviewMeta>({
    supplierName: "",
    companyName: "",
    companyAddress: "",
    locationReference: "",
    locationAddress: "",
    locationPhone: "",
  });
  const [itemsResetKey, setItemsResetKey] = useState(0);
  const nextRowIdRef = useRef(1);
  const hasRestoredDraftRef = useRef(false);
  const skipNextDraftPersistRef = useRef(false);
  const skipNextBatchReloadRef = useRef(false);
  const canSaveBatch = supplierId.trim() !== "" && batchName.trim() !== "";
  const canAddRows = selectedBatchId.trim() !== "";
  const allRowsComplete = useMemo(
    () =>
      rows.length > 0 &&
      rows.every(
        (row) => {
          const mfg = parseDDMMYYYY(row.manufactureDate.trim());
          const exp = parseDDMMYYYY(row.expireDate.trim());
          return Boolean(
            row.locationId.trim() &&
            row.itemCode.trim() &&
              row.itemName.trim() &&
              row.unitPrice.trim() &&
              row.quantity.trim() &&
              mfg &&
              exp &&
              exp >= mfg
          );
        }
      ),
    [rows]
  );

  const locationItems = useMemo(() => {
    if (!selectedLocationId) return [];
    return itemCatalog.filter((item) => item.companyLocationId === selectedLocationId);
  }, [itemCatalog, selectedLocationId]);

  const allCodeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of itemCatalog) {
      if (item.sku) set.add(item.sku);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [itemCatalog]);
  const filteredBatches = useMemo(() => batches, [batches]);

  const activeRow = useMemo(
    () => rows.find((row) => row.id === activeRowId) ?? null,
    [rows, activeRowId]
  );

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
  );
  const activeRowLocation = useMemo(() => {
    if (!activeRow?.locationId) return null;
    return locations.find((location) => location.id === activeRow.locationId) ?? null;
  }, [locations, activeRow]);

  const normalizedRowsForCompare = useMemo(
    () =>
      rows.map((row) => ({
        locationId: row.locationId.trim(),
        itemCode: row.itemCode.trim(),
        itemName: row.itemName.trim(),
        unitPrice: row.unitPrice.trim(),
        quantity: row.quantity.trim(),
        manufactureDate: row.manufactureDate.trim(),
        expireDate: row.expireDate.trim(),
      })),
    [rows]
  );

  const loadedDataUnchanged = useMemo(() => {
    if (!loadedSnapshot) return false;
    if (selectedBatchId !== loadedSnapshot.batchId) return false;
    if ((selectedLocationId || "") !== (loadedSnapshot.locationId || "")) return false;
    if (normalizedRowsForCompare.length !== loadedSnapshot.rows.length) return false;

    for (let i = 0; i < normalizedRowsForCompare.length; i += 1) {
      const current = normalizedRowsForCompare[i];
      const original = loadedSnapshot.rows[i];
      if (
        current.locationId !== original.locationId ||
        current.itemCode !== original.itemCode ||
        current.itemName !== original.itemName ||
        current.unitPrice !== original.unitPrice ||
        current.quantity !== original.quantity ||
        current.manufactureDate !== original.manufactureDate ||
        current.expireDate !== original.expireDate
      ) {
        return false;
      }
    }
    return true;
  }, [loadedSnapshot, normalizedRowsForCompare, selectedBatchId, selectedLocationId]);

  function getValidRowsForSave() {
    return rows.filter(
      (row) =>
        row.locationId.trim() &&
        row.itemCode.trim() &&
        row.itemName.trim() &&
        row.unitPrice.trim() &&
        row.quantity.trim() &&
        row.manufactureDate.trim() &&
        row.expireDate.trim()
    );
  }

  async function handleCreateBatch() {
    const trimmed = batchName.trim();
    if (!supplierId) {
      notify.error("Supplier is required");
      return;
    }
    if (!trimmed) {
      notify.error("Batch name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplierId,
        batchName: trimmed,
        batchDate,
        remark,
        items: [],
      };

      const res = await fetch("/api/admin/sticker-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; id?: string; batchName?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save sticker batch");
        return;
      }

      const createdId = data.id;
      const createdBatchName = data.batchName;
      if (typeof createdId === "string" && typeof createdBatchName === "string") {
        setBatches((prev) =>
          prev.some((b) => b.id === createdId)
            ? prev
            : [{ id: createdId, batchName: createdBatchName, mode: "unassigned" }, ...prev]
        );
      }
      setSupplierId("");
      setBatchName("");
      setBatchDate(today);
      setRemark("");
      notify.success("Sticker batch saved.");
    } catch {
      notify.error("Failed to save sticker batch");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBatchItems() {
    if (!selectedBatchId) {
      notify.error("Select batch name");
      return;
    }
    const validRows = getValidRowsForSave();
    if (validRows.length === 0) {
      notify.error("Add at least one complete item row");
      return;
    }

    setSavingItems(true);
    try {
      const hasLocationGap = validRows.some((row) => !row.locationId.trim());
      if (hasLocationGap) {
        notify.error("Select location for each item row");
        return;
      }

      const payload = {
        mode: "multiple" as const,
        items: validRows.map((row) => ({
          locationId: row.locationId.trim(),
          itemCode: row.itemCode.trim(),
          itemName: row.itemName.trim(),
          unitPrice: row.unitPrice.trim(),
          quantity: Number.parseInt(row.quantity, 10) || 0,
          manufactureDate: row.manufactureDate.trim(),
          expireDate: row.expireDate.trim(),
        })),
      };
      const res = await fetch(`/api/admin/sticker-batches/${selectedBatchId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; count?: number };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save sticker batch items");
        return;
      }
      const savedLocationIds = new Set(
        validRows.map((row) => row.locationId.trim())
      );
      const updatedMode: BatchOption["mode"] =
        savedLocationIds.size > 1 ? "multiple" : "single";
      setBatches((prev) =>
        prev.map((batch) =>
          batch.id === selectedBatchId ? { ...batch, mode: updatedMode } : batch
        )
      );
      skipNextDraftPersistRef.current = true;
      nextRowIdRef.current = 1;
      setLoadedSnapshot(null);
      setSelectedBatchId("");
      setRows([]);
      setActiveRowId(null);
      setIsPreviewLifted(false);
      setRowsToAdd("");
      setSelectedLocationId("");
      setPreviewMeta({
        supplierName: "",
        companyName: "",
        companyAddress: "",
        locationReference: "",
        locationAddress: "",
        locationPhone: "",
      });
      setItemsResetKey((prev) => prev + 1);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ITEMS_DRAFT_STORAGE_KEY);
      }
      notify.success("Sticker batch items saved.");
    } catch {
      notify.error("Failed to save sticker batch items");
    } finally {
      setSavingItems(false);
    }
  }

  function getRowsToAddCount() {
    const parsed = Number.parseInt(rowsToAdd, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(100, parsed));
  }

  function handleAddRows() {
    if (!canAddRows) return;
    const count = getRowsToAddCount();
    const start = nextRowIdRef.current;
    const newRows = Array.from({ length: count }, (_, index) => ({
      ...createEmptyRow(String(start + index)),
      locationId: selectedLocationId,
    }));
    nextRowIdRef.current = start + count;
    setRows((prev) => [...prev, ...newRows]);
  }

  function handleRemoveAllRows() {
    nextRowIdRef.current = 1;
    setRows([]);
    setActiveRowId(null);
    setIsPreviewLifted(false);
  }

  function handleRemoveRow(rowId: string) {
    setRows((prev) => {
      const removedIndex = prev.findIndex((row) => row.id === rowId);
      const nextRows = prev.filter((row) => row.id !== rowId);
      if (activeRowId === rowId) {
        const fallback =
          nextRows[removedIndex] ?? nextRows[Math.max(removedIndex - 1, 0)] ?? null;
        setActiveRowId(fallback?.id ?? null);
      }
      return nextRows;
    });
  }

  function handleRowFocus(rowId: string) {
    setActiveRowId(rowId);
  }

  function matchItem(itemCode: string, locationId?: string) {
    const normalized = itemCode.trim().toLowerCase();
    if (!normalized) return null;
    const scopedItems = locationId
      ? itemCatalog.filter((item) => item.companyLocationId === locationId)
      : locationItems;
    const exactLocation = scopedItems.find(
      (item) => item.sku?.trim().toLowerCase() === normalized
    );
    if (exactLocation) return exactLocation;

    const startsWithLocation = scopedItems.filter((item) =>
      item.sku?.trim().toLowerCase().startsWith(normalized)
    );
    if (startsWithLocation.length === 1) return startsWithLocation[0];

    const exactGlobal = itemCatalog.find(
      (item) => item.sku?.trim().toLowerCase() === normalized
    );
    if (exactGlobal) return exactGlobal;

    const startsWithGlobal = itemCatalog.filter((item) =>
      item.sku?.trim().toLowerCase().startsWith(normalized)
    );
    if (startsWithGlobal.length === 1) return startsWithGlobal[0];

    return null;
  }

  function setRow(rowId: string, patch: Partial<ItemRow>) {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function handleItemCodeChange(rowId: string, itemCode: string) {
    const row = rows.find((entry) => entry.id === rowId);
    const rowLocationId = row?.locationId?.trim() || selectedLocationId;
    const item = matchItem(itemCode, rowLocationId || undefined);
    if (!item) {
      setRow(rowId, { itemCode, itemName: "", unitPrice: "" });
      return;
    }
    const itemName = item.variantTitle
      ? `${item.productTitle} (${item.variantTitle})`
      : item.productTitle;
    setRow(rowId, {
      itemCode,
      itemName,
      unitPrice: formatToTwoDecimals(item.price),
    });
  }

  function handleDateChange(
    rowId: string,
    field: "manufactureDate" | "expireDate",
    value: string,
  ) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const nextMfg = field === "manufactureDate" ? value : row.manufactureDate;
    const nextExp = field === "expireDate" ? value : row.expireDate;
    setRow(rowId, {
      [field]: value,
      age: computeAge(nextMfg, nextExp),
    });
  }

  function handleLocationChange(locationId: string) {
    setSelectedLocationId(locationId);
  }

  function applySelectedLocationToAllRows() {
    if (!selectedLocationId) {
      notify.error("Select location first");
      return;
    }
    if (rows.length === 0) {
      notify.error("Add rows first");
      return;
    }
    setRows((prev) => prev.map((row) => ({ ...row, locationId: selectedLocationId })));
  }

  useEffect(() => {
    if (!selectedBatchId) {
      setRows([]);
      setActiveRowId(null);
      setIsPreviewLifted(false);
      nextRowIdRef.current = 1;
      setLoadedSnapshot(null);
      setPreviewMeta({
        supplierName: "",
        companyName: "",
        companyAddress: "",
        locationReference: "",
        locationAddress: "",
        locationPhone: "",
      });
      return;
    }
    if (skipNextBatchReloadRef.current) {
      skipNextBatchReloadRef.current = false;
      return;
    }

    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/sticker-batches/${selectedBatchId}`);
        const data = (await res.json()) as BatchDetailsResponse;
        if (!res.ok) {
          if (active) {
            notify.error(data.error ?? "Failed to load sticker batch items");
          }
          return;
        }

        if (!active) return;
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0) {
          setRows([]);
          setActiveRowId(null);
          setIsPreviewLifted(false);
          nextRowIdRef.current = 1;
          setPreviewMeta({
            supplierName: data.supplierName ?? "",
            companyName: data.companyName ?? "",
            companyAddress: data.companyAddress ?? "",
            locationReference: "",
            locationAddress: "",
            locationPhone: "",
          });
          setLoadedSnapshot({
            batchId: selectedBatchId,
            locationId: "",
            mode: "multiple",
            rows: [],
          });
          return;
        }

        const firstItem = items[0];
        const locationId = firstItem?.locationId?.trim() ?? "";
        const locationReference = firstItem?.locationReference?.trim() ?? "";
        const locationName = firstItem?.locationName?.trim() ?? "";
        const locationAddress = firstItem?.locationAddress?.trim() ?? "";
        const locationPhone = firstItem?.locationPhone?.trim() ?? "";

        const matchedLocationById = locationId
          ? locations.find((location) => location.id === locationId)
          : null;
        const matchedLocationByReference =
          !matchedLocationById && locationReference
            ? locations.find(
                (location) =>
                  (location.locationReference?.trim() ?? "") === locationReference
              )
            : null;
        const matchedLocationByName =
          !matchedLocationById && !matchedLocationByReference && locationName
            ? locations.find((location) => location.name.trim() === locationName)
            : null;

        const resolvedLocationId =
          matchedLocationById?.id ??
          matchedLocationByReference?.id ??
          matchedLocationByName?.id ??
          "";
        const uniqueLocationIds = new Set(items.map((item) => item.locationId?.trim() ?? "").filter(Boolean));
        setSelectedLocationId(uniqueLocationIds.size === 1 ? resolvedLocationId : "");
        setPreviewMeta({
          supplierName: data.supplierName ?? "",
          companyName: data.companyName ?? "",
          companyAddress: data.companyAddress ?? "",
          locationReference,
          locationAddress,
          locationPhone,
        });

        const nextRows = items.map((item, index) => {
          const manufactureDate = formatDateFromApi(item.manufactureDate);
          const expireDate = formatDateFromApi(item.expireDate);
          return {
            id: String(index + 1),
            locationId: item.locationId ?? "",
            itemCode: item.itemCode ?? "",
            itemName: item.itemName ?? "",
            unitPrice: formatToTwoDecimals(item.unitPrice ?? ""),
            quantity: String(item.quantity ?? ""),
            manufactureDate,
            expireDate,
            age: computeAge(manufactureDate, expireDate),
          };
        });
        setRows(nextRows);
        setActiveRowId(null);
        setIsPreviewLifted(false);
        nextRowIdRef.current = nextRows.length + 1;
        setLoadedSnapshot({
          batchId: selectedBatchId,
          locationId: uniqueLocationIds.size === 1 ? resolvedLocationId : "",
          mode: "multiple",
          rows: nextRows.map((row) => ({
            locationId: row.locationId.trim(),
            itemCode: row.itemCode.trim(),
            itemName: row.itemName.trim(),
            unitPrice: row.unitPrice.trim(),
            quantity: row.quantity.trim(),
            manufactureDate: row.manufactureDate.trim(),
            expireDate: row.expireDate.trim(),
          })),
        });
      } catch {
        if (active) notify.error("Failed to load sticker batch items");
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedBatchId, locations]);

  // Restore unfinished Sticker Batch Items draft when page is revisited.
  useEffect(() => {
    if (typeof window === "undefined" || hasRestoredDraftRef.current) return;
    hasRestoredDraftRef.current = true;
    try {
      const raw = window.localStorage.getItem(ITEMS_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        selectedBatchId?: string;
        selectedLocationId?: string;
        rowsToAdd?: string;
        rows?: ItemRow[];
        nextRowId?: number;
      };
      const restoredRows = Array.isArray(draft.rows)
        ? draft.rows.map((row, index) => {
            const manufactureDate = (row.manufactureDate ?? "").trim();
            const expireDate = (row.expireDate ?? "").trim();
            return {
              ...createEmptyRow(String(index + 1)),
              ...row,
              id: row.id ? String(row.id) : String(index + 1),
              locationId: row.locationId ?? "",
              manufactureDate,
              expireDate,
              age: computeAge(manufactureDate, expireDate),
            };
          })
        : [];

      if (typeof draft.selectedBatchId === "string") {
        setSelectedBatchId(draft.selectedBatchId);
      }
      if (typeof draft.selectedLocationId === "string") {
        setSelectedLocationId(draft.selectedLocationId);
      }
      if (typeof draft.rowsToAdd === "string") {
        setRowsToAdd(draft.rowsToAdd);
      }
      if (restoredRows.length > 0) {
        setRows(restoredRows);
        setActiveRowId(null);
        setIsPreviewLifted(false);
      }

      if (typeof draft.nextRowId === "number" && Number.isFinite(draft.nextRowId)) {
        nextRowIdRef.current = Math.max(1, draft.nextRowId);
      } else if (restoredRows.length > 0) {
        nextRowIdRef.current = restoredRows.length + 1;
      }
      if ((draft.selectedBatchId ?? "").trim() && restoredRows.length > 0) {
        // Keep unsaved draft rows instead of overwriting them with batch API data on first mount.
        skipNextBatchReloadRef.current = true;
      }
    } catch {
      // Ignore malformed local draft.
    }
  }, []);

  // Persist unfinished Sticker Batch Items draft after each change.
  useEffect(() => {
    if (typeof window === "undefined" || !hasRestoredDraftRef.current) return;
    if (skipNextDraftPersistRef.current) {
      skipNextDraftPersistRef.current = false;
      return;
    }
    const payload = {
      selectedBatchId,
      selectedLocationId,
      rowsToAdd,
      rows,
      nextRowId: nextRowIdRef.current,
    };
    try {
      window.localStorage.setItem(ITEMS_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [selectedBatchId, selectedLocationId, rowsToAdd, rows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Sticker Batch</CardTitle>
          <p className="text-muted-foreground text-sm">
            Sticker batch pre-data capture (UI only).
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium">Supplier</label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={supplierOpen}
                    className={`h-9 w-full justify-between ${getInlineChangeClass(supplierId)}`}
                  >
                    {supplierId
                      ? (() => {
                          const s = suppliers.find((supplier) => supplier.id === supplierId);
                          return s ? `${s.name} (${s.code})` : "Select supplier";
                        })()
                      : "Select supplier"}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput placeholder="Search supplier..." />
                    <CommandList>
                      <CommandEmpty>No supplier found.</CommandEmpty>
                      <CommandGroup>
                        {suppliers.map((supplier) => (
                          <CommandItem
                            key={supplier.id}
                            value={`${supplier.name} ${supplier.code}`}
                            onSelect={() => {
                              setSupplierId(supplier.id);
                              setSupplierOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 size-4 ${supplierId === supplier.id ? "opacity-100" : "opacity-0"}`}
                            />
                            {supplier.name} ({supplier.code})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch Name (Unique)</label>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="Enter unique batch name"
                className={getInlineChangeClass(batchName)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date (Today)</label>
              <Input
                value={batchDate}
                onChange={(e) => setBatchDate(formatDateTyping(e.target.value))}
                placeholder="DD/MM/YYYY"
                maxLength={10}
                className={getInlineChangeClass(batchDate)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Remark</label>
            <Textarea
              className={`${textareaClassName} ${getInlineChangeClass(remark)}`}
              rows={4}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleCreateBatch} disabled={saving || !canSaveBatch}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Sticker Batch Items</CardTitle>
          <p className="text-muted-foreground text-sm">
            Batch item details based on selected batch number and locations.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-nowrap items-end gap-4 overflow-x-auto">
            <div className="min-w-[240px] flex-1 space-y-2">
              <label className="text-sm font-medium">Batch Name</label>
              <Select
                key={`batch-select-${itemsResetKey}`}
                value={selectedBatchId || undefined}
                onValueChange={(value) => setSelectedBatchId(value)}
              >
                <SelectTrigger
                  className={`${selectClassName} ${getInlineChangeClass(
                    selectedBatchId,
                  )}`}
                >
                  <SelectValue placeholder="Select batch number" />
                </SelectTrigger>
                <SelectContent>
                  {filteredBatches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batchName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[240px] flex-1 space-y-2">
              <label className="text-sm font-medium">Default Location (Optional)</label>
              <Select
                key={`default-location-select-${itemsResetKey}`}
                value={selectedLocationId || undefined}
                onValueChange={(value) => handleLocationChange(value)}
              >
                <SelectTrigger className={selectClassName}>
                  <SelectValue placeholder="Select default location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.locationReference?.trim() || location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[120px] min-w-[120px] space-y-2">
              <label className="text-sm font-medium">Add Rows</label>
              <Input
                type="number"
                min={1}
                value={rowsToAdd}
                onChange={(e) => setRowsToAdd(e.target.value)}
                className={getInlineChangeClass(rowsToAdd)}
              />
            </div>
            <div className="shrink-0">
              <Button type="button" onClick={handleAddRows} disabled={!canAddRows}>
                Add
              </Button>
            </div>
            <div className="shrink-0">
              <Button type="button" variant="outline" onClick={handleRemoveAllRows}>
              Remove All
              </Button>
            </div>
            <div className="shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={applySelectedLocationToAllRows}
                disabled={!selectedLocationId || rows.length === 0}
              >
                Apply To All
              </Button>
            </div>
          </div>

          <datalist id="item-code-options">
            {allCodeOptions.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Location</th>
                  <th className="p-3 font-medium">Item Code</th>
                  <th className="p-3 font-medium">Item Name</th>
                  <th className="p-3 font-medium">Unit Price</th>
                  <th className="p-3 font-medium">Quantity</th>
                  <th className="p-3 font-medium">Manufac Date</th>
                  <th className="p-3 font-medium">Exp Date</th>
                  <th className="p-3 font-medium">Age</th>
                  <th className="p-3 font-medium">Remove</th>
                  <th className="p-3 font-medium">Add</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.id}
                    onClick={() => handleRowFocus(row.id)}
                    className={`border-b last:border-b-0 ${activeRowId === row.id ? "bg-muted/50" : ""}`}
                  >
                    <td className="p-3">
                      <Select
                        value={row.locationId || undefined}
                        onValueChange={(value) => setRow(row.id, { locationId: value })}
                      >
                        <SelectTrigger className={getInlineChangeClass(row.locationId)}>
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.locationReference?.trim() || location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Input
                        value={row.itemCode}
                        list="item-code-options"
                        onChange={(e) =>
                          handleItemCodeChange(row.id, e.target.value)
                        }
                        onFocus={() => handleRowFocus(row.id)}
                        placeholder="Type code"
                        className={getInlineChangeClass(row.itemCode)}
                      />
                    </td>
                    <td className="p-3">
                      <Input value={row.itemName} readOnly />
                    </td>
                    <td className="p-3">
                      <Input value={row.unitPrice} readOnly />
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        value={row.quantity}
                        onChange={(e) =>
                          setRow(row.id, { quantity: e.target.value })
                        }
                        onFocus={() => handleRowFocus(row.id)}
                        className={getInlineChangeClass(row.quantity)}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        value={row.manufactureDate}
                        onChange={(e) =>
                          handleDateChange(
                            row.id,
                            "manufactureDate",
                            formatDateTyping(e.target.value),
                          )
                        }
                        onFocus={() => handleRowFocus(row.id)}
                        placeholder="DD/MM/YYYY"
                        maxLength={10}
                        className={getInlineChangeClass(row.manufactureDate)}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        value={row.expireDate}
                        onChange={(e) =>
                          handleDateChange(
                            row.id,
                            "expireDate",
                            formatDateTyping(e.target.value),
                          )
                        }
                        onFocus={() => handleRowFocus(row.id)}
                        placeholder="DD/MM/YYYY"
                        maxLength={10}
                        className={getInlineChangeClass(row.expireDate)}
                      />
                    </td>
                    <td className="p-3">
                      <Input value={row.age} readOnly />
                    </td>
                    <td className="p-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleRemoveRow(row.id)}
                      >
                        Remove
                      </Button>
                    </td>
                    <td className="p-3">
                      {index === rows.length - 1 ? (
                        <Button type="button" onClick={handleAddRows} disabled={!canAddRows}>
                          Add
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {activeRow ? (
            <div
              onMouseEnter={() => setIsPreviewLifted((prev) => !prev)}
              className={`fixed right-4 z-50 hidden rounded-lg border bg-background/80 p-3 shadow-md backdrop-blur-sm transition-all duration-200 ease-out md:block ${
                isPreviewLifted ? "bottom-35" : "bottom-4"
              }`}
            >
              <StickerPreviewCard
                manufactureDate={activeRow.manufactureDate}
                expireDate={activeRow.expireDate}
                itemCode={activeRow.itemCode}
                itemName={activeRow.itemName}
                unitPrice={activeRow.unitPrice}
                locationReference={
                  activeRowLocation?.locationReference?.trim() ||
                  selectedLocation?.locationReference?.trim() ||
                  previewMeta.locationReference
                }
                supplierName={previewMeta.supplierName}
                companyName={previewMeta.companyName}
                locationAddress={previewMeta.locationAddress}
                companyAddress={previewMeta.companyAddress}
                locationPhone={previewMeta.locationPhone}
              />
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveBatchItems}
              disabled={savingItems || !allRowsComplete || !canAddRows || loadedDataUnchanged}
            >
              {savingItems ? "Saving Items..." : "Save Items"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
