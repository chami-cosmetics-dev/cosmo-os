"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import {
  getGccPriceTally,
  getOgfPriceTally,
  getPriceStatus,
  getStandardPriceTally,
  ITEM_CREATION_TAX_STATUS_VALUES,
  ITEM_CREATION_STATUS_LABELS,
  PRICE_STATUS_LABELS,
  isItemCreationStageCompletionVisible,
} from "@/lib/item-creation/helpers";
import { allocateTakeQty } from "@/lib/store-allocation/allocate";

type ItemCreationItem = {
  id: string;
  sku: string;
  description: string;
  standardPrice: string | number;
  ogfPrice: string | number | null;
  gccPrice: string | number | null;
  addErp1OgfPrice: boolean;
  country: string;
  taxStatus: string;
  creationSources: string[];
  overallStatus: string;
  seoSetupStatus: string;
  seoActivationStatus: string;
  digitalMarketingStatus: string;
  digitalMarketingBrand?: string | null;
  digitalMarketingAssigneeId?: string | null;
  digitalMarketingAssignee?: {
    id: string;
    knownName: string | null;
    name: string | null;
    email: string | null;
  } | null;
  purchasingStatus: string;
  storeTransferStatus: string;
  storeStockStatus: string;
  imageDriveUrl: string | null;
  erpStandardPrice: string | number | null;
  erpOgfPrice: string | number | null;
  erp1OgfPrice: string | number | null;
  erp2GccPrice: string | number | null;
  erp2ItemCreationStatus: string;
  erp2ItemCreationError: string | null;
  erp2ItemCode: string | null;
  createdAt: string;
  itemCreatedAt?: string | null;
  imageCreatedAt?: string | null;
  imageUpdatedAt?: string | null;
  priceUpdatedAt?: string | null;
  stockReadyAt?: string | null;
  stockAddedAt?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  activatedAt?: string | null;
  completedAt?: string | null;
};

type Props = {
  initialItems: ItemCreationItem[];
  initialFilters: Record<string, string>;
  permissions: {
    admin: boolean;
    adminViewer: boolean;
    manageAll: boolean;
    seo: boolean;
    digitalMarketing: boolean;
    digitalMarketingAdmin: boolean;
    purchasing: boolean;
    stores: boolean;
  };
  vaultOs: boolean;
};

type TeamView = "admin" | "seo" | "digitalMarketing" | "purchasing" | "stores";
type WorkTeamView = Exclude<TeamView, "admin">;
type DigitalMarketingAdminPage = "requests" | "allocations";
type CreateRow = {
  key: number;
  sku: string;
  description: string;
  standardPrice: string;
  ogfPrice: string;
  gccPrice: string;
  addErp1OgfPrice: boolean;
  country: string;
  taxStatus: string;
  creationSources: string[];
};

type StockErp = "erp1" | "erp2";
type StockOption = {
  name: string;
  label: string;
  company?: string | null;
  priority?: number;
};

type ExistingStockLookup = {
  itemCode: string;
  itemName: string;
  barcode: string | null;
  rop: number;
  currentStock: number | null;
  warehouseDetails: Array<{ warehouse: string; erp: "ERP1" | "ERP2"; barcode: string | null; rop: number; stock: number | null }>;
  erps: Array<"ERP1" | "ERP2">;
};

type StockAllocationItem = Pick<
  ItemCreationItem,
  "id" | "sku" | "description" | "seoSetupStatus" | "digitalMarketingStatus"
> & {
  isExisting?: boolean;
  erp?: StockErp;
  erps?: StockErp[];
  barcode?: string | null;
  rop?: number;
  currentStock?: number | null;
  warehouseDetails?: Array<{ warehouse: string; erp: StockErp; barcode: string | null; rop: number; stock: number | null }>;
};
type StockOptions = {
  suppliers: StockOption[];
  warehouses: StockOption[];
};
type StockWarehouseRow = {
  key: number;
  warehouse: string;
  qty: string;
  priority?: number;
  erp?: StockErp;
};
type TeamSection = {
  title: string;
  subtitle: string;
  team: WorkTeamView;
  visible: boolean;
  items: ItemCreationItem[];
  action: (item: ItemCreationItem) => ReactNode;
};

const status = (value: string) => ITEM_CREATION_STATUS_LABELS[value] ?? value;
const money = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "-";
};
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const formatDate = (value: string) => dateFormatter.format(new Date(value));
function currentStageSince(item: ItemCreationItem) {
  if (item.seoSetupStatus === "PENDING") return item.createdAt;
  if (item.seoSetupStatus === "ITEM_CREATED") return item.itemCreatedAt ?? item.createdAt;
  if (item.digitalMarketingStatus === "PENDING") return item.itemCreatedAt ?? item.createdAt;
  if (item.purchasingStatus === "WAITING_FOR_PRICES") return item.imageUpdatedAt ?? item.createdAt;
  if (item.storeStockStatus !== "STOCK_ADDED") return item.stockReadyAt ?? item.priceUpdatedAt ?? item.createdAt;
  if (item.storeTransferStatus === "PENDING") return item.stockAddedAt ?? item.createdAt;
  if (item.storeTransferStatus === "SENT") return item.sentAt ?? item.createdAt;
  return item.receivedAt ?? item.createdAt;
}
function elapsedLabel(since: string, now: number | null) {
  if (now == null) return "-";
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes % 60}m`;
}

function elapsedBetween(since: string, until: string | null | undefined, now: number | null) {
  if (now == null) return "-";
  const end = until ? new Date(until).getTime() : now;
  const minutes = Math.max(0, Math.floor((end - new Date(since).getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes % 60}m`;
}

function stageAgeLabel(
  item: ItemCreationItem,
  stage: "seo" | "digital" | "purchasing" | "transfer" | "stock" | "activation",
  value: string,
  now: number | null,
) {
  if (
    (stage === "digital" && item.seoSetupStatus === "PENDING") ||
    (stage === "purchasing" && item.purchasingStatus === "LOCKED") ||
    (stage === "stock" && item.storeStockStatus === "WAITING_FOR_PRICE") ||
    (stage === "activation" && item.seoActivationStatus === "LOCKED")
  ) {
    return "-";
  }
  const start = stage === "seo"
    ? item.createdAt
    : stage === "digital"
      ? item.itemCreatedAt ?? item.createdAt
      : stage === "purchasing"
        ? item.imageUpdatedAt ?? item.itemCreatedAt ?? item.createdAt
        : stage === "transfer"
            ? item.createdAt
          : stage === "stock"
            ? item.stockReadyAt ?? item.priceUpdatedAt ?? item.createdAt
            : item.stockAddedAt ?? item.receivedAt ?? item.createdAt;
  const end = stage === "seo" && value === "COMPLETED"
    ? item.imageUpdatedAt ?? item.itemCreatedAt
    : stage === "seo" && value === "ITEM_CREATED"
      ? item.itemCreatedAt
      : stage === "digital" && value === "IMAGE_CREATED"
        ? item.imageCreatedAt ?? item.imageUpdatedAt
        : stage === "purchasing" && value === "PRICE_UPDATED"
          ? item.priceUpdatedAt
          : stage === "transfer" && value === "RECEIVED"
            ? item.receivedAt
            : stage === "stock" && value === "STOCK_ADDED"
              ? item.stockAddedAt
              : stage === "activation" && value === "ACTIVATED"
                ? item.activatedAt
                : null;
  return elapsedBetween(start, end, now);
}

function StageStatus({
  item,
  stage,
  value,
  now,
}: {
  item: ItemCreationItem;
  stage: "seo" | "digital" | "purchasing" | "transfer" | "stock" | "activation";
  value: string;
  now: number | null;
}) {
  return (
    <div className="grid gap-1">
      <StatusPill value={value} />
      <span className="text-xs text-muted-foreground">{stageAgeLabel(item, stage, value, now)}</span>
    </div>
  );
}

const inputClass =
  "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary";
const primaryButtonClass =
  "h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "h-10 rounded-md border bg-background px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";

function selectedItemsNotConfirmed(
  selectedIds: Set<string>,
  confirmedIds: Set<string>,
  items: ItemCreationItem[],
) {
  return items.some(
    (item) => selectedIds.has(item.id) && item.seoSetupStatus !== "PENDING" && !confirmedIds.has(item.id),
  );
}

const viewTabs: Array<{ view: TeamView; label: string; description: string }> = [
  { view: "admin", label: "Admin", description: "Create, filter, monitor" },
  { view: "seo", label: "SEO Team", description: "Item setup and activation" },
  {
    view: "digitalMarketing",
    label: "Digital Marketing",
    description: "Image and Drive link",
  },
  { view: "purchasing", label: "Purchasing", description: "ERP price checks" },
  { view: "stores", label: "Stores", description: "Transfer and stock" },
];

const teamLabels: Record<WorkTeamView, string> = {
  seo: "SEO Team",
  digitalMarketing: "Digital Marketing",
  purchasing: "Purchasing",
  stores: "Stores",
};

function teamViewLabel(view: WorkTeamView) {
  return teamLabels[view];
}

function recentCompletionVisible(completedAt: string | null | undefined, now: number | null) {
  return now == null || isItemCreationStageCompletionVisible(completedAt, now);
}

function completedCountForView(items: ItemCreationItem[], view: TeamView, now: number | null) {
  if (view === "admin") return items.filter((item) => item.overallStatus === "COMPLETED").length;
  if (view === "seo") {
    return items.filter(
      (item) => item.seoActivationStatus === "ACTIVATED" && recentCompletionVisible(item.activatedAt, now),
    ).length;
  }
  if (view === "digitalMarketing") {
    return items.filter(
      (item) => item.digitalMarketingStatus === "IMAGE_CREATED" && recentCompletionVisible(item.imageCreatedAt, now),
    ).length;
  }
  if (view === "purchasing") {
    return items.filter(
      (item) => item.purchasingStatus === "PRICE_UPDATED" && recentCompletionVisible(item.priceUpdatedAt, now),
    ).length;
  }
  return items.filter(
    (item) =>
      (item.storeTransferStatus === "RECEIVED" && recentCompletionVisible(item.receivedAt, now)) ||
      (item.storeStockStatus === "STOCK_ADDED" && recentCompletionVisible(item.stockAddedAt, now)),
  ).length;
}

const emptyCreateRow = (key: number): CreateRow => ({
  key,
  sku: "",
  description: "",
  standardPrice: "",
  ogfPrice: "",
  gccPrice: "",
  addErp1OgfPrice: false,
  country: "",
  taxStatus: "Vat / Non Vat",
  creationSources: ["SHOPIFY"],
});

function defaultView(permissions: Props["permissions"]): TeamView {
  if (permissions.admin || permissions.adminViewer) return "admin";
  if (permissions.seo) return "seo";
  if (permissions.digitalMarketing) return "digitalMarketing";
  if (permissions.purchasing) return "purchasing";
  return "stores";
}

export function ItemCreationPanel({
  initialItems,
  initialFilters,
  permissions,
  vaultOs,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [activeView, setActiveView] = useState<TeamView>(defaultView(permissions));
  const [digitalMarketingAdminPage, setDigitalMarketingAdminPage] =
    useState<DigitalMarketingAdminPage>("requests");
  const [createRows, setCreateRows] = useState<CreateRow[]>([emptyCreateRow(1)]);
  const [selectedCreateRows, setSelectedCreateRows] = useState<Set<number>>(new Set());
  const [now, setNow] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const allCreateRowsSelected =
    createRows.length > 0 && createRows.every((row) => selectedCreateRows.has(row.key));
  const selectedCreateRowCount = selectedCreateRows.size;
  const selectedRowsForBulk = createRows.filter((row) => selectedCreateRows.has(row.key));
  const selectedShopifyChecked =
    selectedRowsForBulk.length > 0 && selectedRowsForBulk.every((row) => row.creationSources.includes("SHOPIFY"));
  const selectedErp2Checked =
    selectedRowsForBulk.length > 0 && selectedRowsForBulk.every((row) => row.creationSources.includes("ERP2"));
  const selectedErp1OgfChecked =
    selectedRowsForBulk.length > 0 && selectedRowsForBulk.every((row) => row.addErp1OgfPrice);

  const canAct = (area: keyof Props["permissions"]) =>
    permissions.manageAll || permissions[area] || (area === "digitalMarketing" && permissions.digitalMarketingAdmin);

  const visibleViewTabs = viewTabs.filter((tab) =>
    tab.view === "admin" ? permissions.admin || permissions.adminViewer : canAct(tab.view),
  );

  async function refresh(nextFilters = filters) {
    const params = new URLSearchParams(
      Object.entries(nextFilters).filter(([, value]) => value)
    );
    const response = await fetch(`/api/item-creation?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to load requests");
    setItems(data.items);
  }

  async function post(url: string, body?: unknown) {
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Action failed");
    await refresh();
    if (url.startsWith("/api/item-creation/stock/")) {
      const receiptCount = Array.isArray(data.receipts) ? data.receipts.length : 1;
      setMessage(
        receiptCount === 1
          ? "Purchase Receipt created"
          : `${receiptCount} Purchase Receipts created`
      );
      return;
    }
    setMessage("Updated");
  }

  async function mutate(url: string, method: "PATCH" | "DELETE", body?: unknown) {
    setMessage("");
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Action failed");
    await refresh();
    setMessage(method === "DELETE" ? "Deleted" : "Updated");
  }

  function submitCreate() {
    startTransition(async () => {
      try {
        const items = createRows
          .map((row) => ({
            sku: row.sku.trim(),
            description: row.description.trim(),
            standardPrice: row.standardPrice,
            ogfPrice: vaultOs ? undefined : row.ogfPrice,
            gccPrice: vaultOs ? undefined : row.gccPrice,
            addErp1OgfPrice: vaultOs ? false : row.addErp1OgfPrice,
            country: row.country.trim(),
            taxStatus: row.taxStatus,
            creationSources: row.creationSources,
          }))
          .filter((row) => row.sku || row.description || row.standardPrice || (!vaultOs && (row.ogfPrice || row.gccPrice)));
        await post("/api/item-creation", { items });
        setCreateRows([emptyCreateRow(Date.now())]);
        setSelectedCreateRows(new Set());
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Create failed");
      }
    });
  }

  function updateCreateRow(key: number, field: keyof Omit<CreateRow, "key">, value: string | boolean) {
    setCreateRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
  }

  function toggleCreateSource(key: number, source: string) {
    setCreateRows((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const sources = row.creationSources.includes(source)
          ? row.creationSources.filter((value) => value !== source)
          : [...row.creationSources, source];
        return { ...row, creationSources: sources.length ? sources : [source] };
      })
    );
  }

  function toggleCreateRowSelection(key: number) {
    setSelectedCreateRows((selected) => {
      const next = new Set(selected);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAllCreateRows() {
    setSelectedCreateRows((selected) =>
      createRows.every((row) => selected.has(row.key))
        ? new Set()
        : new Set(createRows.map((row) => row.key))
    );
  }

  function setSelectedCreateSource(source: string, checked: boolean) {
    setCreateRows((rows) =>
      rows.map((row) => {
        if (!selectedCreateRows.has(row.key)) return row;
        const sources = checked
          ? [...new Set([...row.creationSources, source])]
          : row.creationSources.filter((value) => value !== source);
        return { ...row, creationSources: sources.length ? sources : [source] };
      })
    );
  }

  function setSelectedErp1Ogf(checked: boolean) {
    setCreateRows((rows) =>
      rows.map((row) =>
        selectedCreateRows.has(row.key) ? { ...row, addErp1OgfPrice: checked } : row
      )
    );
  }

  function addCreateRow() {
    setCreateRows((rows) => [...rows, emptyCreateRow(Date.now())]);
  }

  function removeCreateRow(key: number) {
    setCreateRows((rows) =>
      rows.length === 1 ? [emptyCreateRow(Date.now())] : rows.filter((row) => row.key !== key)
    );
    setSelectedCreateRows((selected) => {
      const next = new Set(selected);
      next.delete(key);
      return next;
    });
  }

  function runAction(url: string, body?: unknown) {
    startTransition(async () => {
      try {
        await post(url, body);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  function updateRequest(id: string, body: unknown) {
    startTransition(async () => {
      try {
        await mutate(`/api/item-creation/${id}`, "PATCH", body);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Update failed");
      }
    });
  }

  function refreshRequests() {
    startTransition(async () => {
      try {
        await refresh();
        setMessage("Refreshed");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Refresh failed");
      }
    });
  }

  function deleteRequest(id: string) {
    startTransition(async () => {
      try {
        await mutate(`/api/item-creation/${id}`, "DELETE");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Delete failed");
      }
    });
  }

  function applyFilters(formData: FormData) {
    const next = Object.fromEntries(formData.entries()) as Record<string, string>;
    setFilters(next);
    startTransition(async () => {
      try {
        await refresh(next);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Filter failed");
      }
    });
  }

  const sections: TeamSection[] = [
    {
      title: "Pending",
      subtitle: "SEO has not created the ERP item yet.",
      team: "seo",
      visible: canAct("seo"),
      items: items.filter((item) => item.seoSetupStatus === "PENDING"),
      action: (item: ItemCreationItem) => (
        <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/seo/item-created`)}>
          Mark Item Created
        </ActionButton>
      ),
    },
    {
      title: "Item Created",
      subtitle: "Waiting for SEO image update confirmation.",
      team: "seo",
      visible: canAct("seo"),
      items: items.filter((item) => item.seoSetupStatus === "ITEM_CREATED"),
      action: (item: ItemCreationItem) => (
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/seo/image-updated`)}>
            Mark SEO Done
          </ActionButton>
          <button
            type="button"
            onClick={() => runAction(`/api/item-creation/${item.id}/seo/revert`)}
            className={secondaryButtonClass}
          >
            Revert SEO
          </button>
        </div>
      ),
    },
    {
      title: "Waiting Activation",
      subtitle: "Mark the Shopify product as activated for internal tracking.",
      team: "seo",
      visible: canAct("seo"),
      items: items.filter((item) => item.seoActivationStatus === "WAITING_ACTIVATION"),
      action: (item: ItemCreationItem) => (
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/seo/activate`)}>
            Mark Shopify Activated
          </ActionButton>
          <button
            type="button"
            onClick={() => runAction(`/api/item-creation/${item.id}/seo/revert`)}
            className={secondaryButtonClass}
          >
            Revert SEO
          </button>
        </div>
      ),
    },
    {
      title: "Completed",
      subtitle: "SEO activation is done.",
      team: "seo",
      visible: canAct("seo"),
      items: items.filter(
        (item) =>
          item.seoActivationStatus === "ACTIVATED" &&
          recentCompletionVisible(item.activatedAt, now),
      ),
      action: (item: ItemCreationItem) => (
        <div className="flex flex-wrap gap-2">
          <StatusPill value="COMPLETED" />
          <button
            type="button"
            onClick={() => runAction(`/api/item-creation/${item.id}/seo/revert`)}
            className={secondaryButtonClass}
          >
            Revert SEO
          </button>
        </div>
      ),
    },
    {
      title: "Pending",
      subtitle: "Add the Drive link and confirm image creation.",
      team: "digitalMarketing",
      visible: canAct("digitalMarketing"),
      items: items.filter(
        (item) => item.digitalMarketingStatus === "PENDING" && item.seoSetupStatus !== "PENDING"
      ),
      action: (item: ItemCreationItem) => (
        <DigitalAction item={item} onAction={runAction} />
      ),
    },
    {
      title: "Completed",
      subtitle: "Drive links are ready for the next stages.",
      team: "digitalMarketing",
      visible: canAct("digitalMarketing"),
      items: items.filter(
        (item) =>
          item.digitalMarketingStatus === "IMAGE_CREATED" &&
          recentCompletionVisible(item.imageCreatedAt, now),
      ),
      action: (item: ItemCreationItem) => (
        <div className="flex flex-wrap gap-2">
          <StatusPill value="COMPLETED" />
          <button
            type="button"
            onClick={() => runAction(`/api/item-creation/${item.id}/digital-marketing/revert`)}
            className={secondaryButtonClass}
          >
            Revert Image
          </button>
        </div>
      ),
    },
    {
      title: "Pending",
      subtitle: "ERP prices are being checked or manually confirmed.",
      team: "purchasing",
      visible: canAct("purchasing"),
      items: items.filter((item) => item.purchasingStatus === "WAITING_FOR_PRICES"),
      action: (item: ItemCreationItem) => (
        <>
          <ActionButton
            disabled={isPending}
            onClick={() => runAction(`/api/item-creation/${item.id}/pricing/update`)}
          >
            Update Prices
          </ActionButton>
          <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/purchasing/price-updated`)}>
            Mark Priced
          </ActionButton>
        </>
      ),
    },
    {
      title: "Completed",
      subtitle: "Prices have been confirmed.",
      team: "purchasing",
      visible: canAct("purchasing"),
      items: items.filter(
        (item) =>
          item.purchasingStatus === "PRICE_UPDATED" &&
          recentCompletionVisible(item.priceUpdatedAt, now),
      ),
      action: () => <StatusPill value="COMPLETED" />,
    },
    {
      title: "Transfer",
      subtitle: "Send and receive the physical transfer.",
      team: "stores",
      visible: canAct("stores"),
      items: items.filter(
        (item) =>
          item.storeTransferStatus !== "RECEIVED" &&
          item.seoSetupStatus !== "PENDING" &&
          item.digitalMarketingStatus === "IMAGE_CREATED",
      ),
      action: (item: ItemCreationItem) =>
        item.storeTransferStatus === "PENDING" ? (
          <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/stores/sent`)}>
            Mark Sent
          </ActionButton>
        ) : (
          <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/stores/received`)}>
            Mark Received
          </ActionButton>
        ),
    },
    {
      title: "Stock",
      subtitle: "Add stock in parallel with pricing.",
      team: "stores",
      visible: canAct("stores"),
      items: items.filter((item) => item.storeStockStatus !== "STOCK_ADDED"),
      action: (item: ItemCreationItem) => (
        <StockReceiptAction item={item} onAction={runAction} />
      ),
    },
  ];

  const visibleSections = sections.filter(
    (section) =>
      section.visible && activeView !== "admin" && section.team === activeView
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Product Management
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">
              Item Creation
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage item setup, images, prices, transfers, stock, and the final Shopify activation marker.
            </p>
          </div>
          {message && (
            <span className="rounded-md border bg-muted px-3 py-2 text-sm">
              {message}
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <MetricCard label="In Progress" value={items.filter((item) => item.overallStatus === "IN_PROGRESS").length} />
          <MetricCard label="Completed" value={completedCountForView(items, activeView, now)} />
          <MetricCard label="Waiting Prices" value={items.filter((item) => item.purchasingStatus === "WAITING_FOR_PRICES").length} />
          <MetricCard label="Waiting Activation" value={items.filter((item) => item.seoActivationStatus === "WAITING_ACTIVATION").length} />
        </div>
      </div>

      {(permissions.admin || permissions.adminViewer) && (
        <div className="grid gap-2 rounded-lg border bg-card p-2 md:grid-cols-5">
          {visibleViewTabs.map((tab) => (
            <button
              key={tab.view}
              type="button"
              onClick={() => setActiveView(tab.view)}
              className={`rounded-md px-3 py-3 text-left transition ${
                activeView === tab.view
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-0.5 block text-xs opacity-80">
                {tab.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {permissions.digitalMarketingAdmin && activeView === "digitalMarketing" && (
        <div className="inline-flex flex-wrap gap-1 rounded-md border bg-card p-1">
          <button
            type="button"
            onClick={() => setDigitalMarketingAdminPage("requests")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              digitalMarketingAdminPage === "requests"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Digital Marketing
          </button>
          <button
            type="button"
            onClick={() => setDigitalMarketingAdminPage("allocations")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              digitalMarketingAdminPage === "allocations"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Brand Allocation
          </button>
        </div>
      )}

      {permissions.digitalMarketingAdmin &&
        activeView === "digitalMarketing" &&
        digitalMarketingAdminPage === "allocations" && (
          <BrandAllocationPanel items={items} onRefresh={refreshRequests} />
        )}

      {permissions.admin && activeView === "admin" && (
        <div className="space-y-4">
          <form action={submitCreate} className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-normal">
                Create Item Request
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={refreshRequests}
                  className={secondaryButtonClass}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={addCreateRow}
                  className={secondaryButtonClass}
                >
                  Add Item
                </button>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={allCreateRowsSelected}
                    onChange={toggleAllCreateRows}
                    className="size-4"
                  />
                  Select all
                </label>
                <span className="text-xs font-medium text-muted-foreground">
                  {selectedCreateRowCount} selected
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Mark selected as
                  </span>
                  <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      disabled={selectedCreateRowCount === 0}
                      checked={selectedShopifyChecked}
                      onChange={(event) => setSelectedCreateSource("SHOPIFY", event.target.checked)}
                      className="size-4"
                    />
                    Shopify
                  </label>
                  <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      disabled={selectedCreateRowCount === 0}
                      checked={selectedErp2Checked}
                      onChange={(event) => setSelectedCreateSource("ERP2", event.target.checked)}
                      className="size-4"
                    />
                    ERP 02
                  </label>
                  {!vaultOs && <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      disabled={selectedCreateRowCount === 0}
                      checked={selectedErp1OgfChecked}
                      onChange={(event) => setSelectedErp1Ogf(event.target.checked)}
                      className="size-4"
                    />
                    ERP1 OGF
                  </label>}
                </div>
              </div>
              <div className="grid gap-2">
                {createRows.map((row, index) => (
                  <div
                    key={row.key}
                    className="grid gap-3 rounded-md border bg-background p-3 xl:grid-cols-[auto_150px_minmax(240px,1fr)_minmax(520px,2fr)_auto] xl:items-center"
                  >
                    <label className="flex h-10 items-center justify-center self-center rounded-md border bg-muted/20 px-3">
                      <input
                        type="checkbox"
                        checked={selectedCreateRows.has(row.key)}
                        onChange={() => toggleCreateRowSelection(row.key)}
                        className="size-4"
                        aria-label={`Select item ${index + 1}`}
                      />
                    </label>
                    <input
                      value={row.sku}
                      onChange={(event) => updateCreateRow(row.key, "sku", event.target.value)}
                      required
                      placeholder="SKU"
                      className={`${inputClass} self-center`}
                    />
                    <textarea
                      value={row.description}
                      onChange={(event) => updateCreateRow(row.key, "description", event.target.value)}
                      required
                      placeholder="Description"
                      className={`${inputClass} min-h-20 resize-none py-2`}
                    />
                    <div className="grid min-w-0 gap-3">
                      <div className={`grid min-w-0 gap-3 sm:grid-cols-2 ${vaultOs ? "" : "xl:grid-cols-4"}`}>
                        <input
                          value={row.standardPrice}
                          onChange={(event) => updateCreateRow(row.key, "standardPrice", event.target.value)}
                          required
                          type="number"
                          step="0.01"
                          placeholder="Standard"
                          className={inputClass}
                        />
                        {!vaultOs && <input
                          value={row.ogfPrice}
                          onChange={(event) => updateCreateRow(row.key, "ogfPrice", event.target.value)}
                          type="number"
                          step="0.01"
                          placeholder="OGF"
                          className={inputClass}
                        />}
                        {!vaultOs && <input
                          value={row.gccPrice}
                          onChange={(event) => updateCreateRow(row.key, "gccPrice", event.target.value)}
                          type="number"
                          step="0.01"
                          placeholder="GCC"
                          className={inputClass}
                        />}
                        <input
                          value={row.country}
                          onChange={(event) => updateCreateRow(row.key, "country", event.target.value)}
                          placeholder="Country"
                          className={inputClass}
                        />
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap">
                        {!vaultOs && <>
                          <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={row.creationSources.includes("SHOPIFY")}
                              onChange={() => toggleCreateSource(row.key, "SHOPIFY")}
                              className="size-4"
                            />
                            Shopify
                          </label>
                          <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={row.creationSources.includes("ERP2")}
                              onChange={() => toggleCreateSource(row.key, "ERP2")}
                              className="size-4"
                            />
                            ERP 02
                          </label>
                          <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={row.addErp1OgfPrice}
                              onChange={(event) => updateCreateRow(row.key, "addErp1OgfPrice", event.target.checked)}
                              className="size-4"
                            />
                            ERP1 OGF
                          </label>
                        </>}
                        <select
                          value={row.taxStatus}
                          onChange={(event) => updateCreateRow(row.key, "taxStatus", event.target.value)}
                          aria-label="Tax status"
                          className="h-9 w-40 shrink-0 rounded-md border bg-background px-3 py-1 text-sm outline-none transition focus:border-primary"
                        >
                          {ITEM_CREATION_TAX_STATUS_VALUES.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCreateRow(row.key)}
                      className={`${secondaryButtonClass} h-10 px-3`}
                      aria-label={`Remove item ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button disabled={isPending} className={primaryButtonClass}>
                  Create {createRows.length === 1 ? "Item Request" : "Item Requests"}
                </button>
              </div>
            </div>
          </form>

          <form action={applyFilters} className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-normal">Filters</h2>
            </div>
            <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto]">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Search SKU or product name
                <input
                  name="search"
                  placeholder="SKU or product name"
                  defaultValue={filters.search ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                SKU
                <input
                  name="sku"
                  placeholder="All SKUs"
                  defaultValue={filters.sku ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Country
                <input
                  name="country"
                  placeholder="All countries"
                  defaultValue={filters.country ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Overall Status
                <select
                  name="overallStatus"
                  defaultValue={filters.overallStatus ?? ""}
                  className={inputClass}
                >
                  <option value="">All statuses</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Created From
                <input
                  name="createdFrom"
                  type="date"
                  defaultValue={filters.createdFrom ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Created To
                <input
                  name="createdTo"
                  type="date"
                  defaultValue={filters.createdTo ?? ""}
                  className={inputClass}
                />
              </label>
              <div className="grid gap-1">
                <span className="invisible text-xs font-medium">Apply</span>
                <button disabled={isPending} className={secondaryButtonClass}>
                  Apply Filters
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {(permissions.adminViewer || permissions.manageAll) && activeView === "admin" ? (
        <AdminTable
          items={items}
          isPending={isPending}
          readOnly={!permissions.manageAll}
          onDelete={deleteRequest}
          onUpdate={updateRequest}
          onAction={runAction}
          onRefresh={refreshRequests}
          vaultOs={vaultOs}
        />
      ) : null}

      {activeView !== "admin" &&
        !(activeView === "digitalMarketing" &&
          permissions.digitalMarketingAdmin &&
          digitalMarketingAdminPage === "allocations") && (
        <TeamWorkflowView
          teamLabel={teamViewLabel(activeView)}
          sections={visibleSections}
          isPending={isPending}
          onRefresh={refreshRequests}
          onAction={runAction}
          vaultOs={vaultOs}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

type BrandAllocation = { id: string; brand: string; userId: string; userName: string };
type DigitalMarketingUser = { id: string; name: string };

function BrandAllocationPanel({
  items,
  onRefresh,
}: {
  items: ItemCreationItem[];
  onRefresh: () => void;
}) {
  const [allocations, setAllocations] = useState<BrandAllocation[]>([]);
  const [users, setUsers] = useState<DigitalMarketingUser[]>([]);
  const [brand, setBrand] = useState("");
  const [userId, setUserId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/item-creation/brand-allocations");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to load brand allocations");
    setAllocations(data.allocations ?? []);
    setUsers(data.users ?? []);
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load allocations"));
  }, []);

  async function save(next: BrandAllocation[]) {
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch("/api/item-creation/brand-allocations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations: next.map(({ brand: value, userId: assignedUserId }) => ({ brand: value, userId: assignedUserId })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save allocations");
      setAllocations(data.allocations ?? []);
      setUsers(data.users ?? users);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save allocations");
    } finally {
      setIsBusy(false);
    }
  }

  function addAllocation() {
    const trimmedBrand = brand.trim();
    if (!trimmedBrand || !userId) {
      setError("Enter a brand and select an allocated person");
      return;
    }
    void save([...allocations, { id: `new-${Date.now()}`, brand: trimmedBrand, userId, userName: users.find((user) => user.id === userId)?.name ?? "User" }]);
    setBrand("");
    setUserId("");
  }

  function removeAllocation(id: string) {
    void save(allocations.filter((allocation) => allocation.id !== id));
  }

  async function updateRequestAssignee(itemId: string, assigneeId: string) {
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/item-creation/${itemId}/digital-marketing/assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to update request assignment");
      onRefresh();
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : "Failed to update request assignment");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">Digital Marketing Brand Allocation</h2>
          <p className="mt-1 text-sm text-muted-foreground">New requests are matched by brand name in the product description.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isBusy} className={secondaryButtonClass}>Refresh</button>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Brand name" className={inputClass} />
        <select value={userId} onChange={(event) => setUserId(event.target.value)} className={inputClass}>
          <option value="">Select Digital Marketing user</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <button type="button" onClick={addAllocation} disabled={isBusy} className={primaryButtonClass}>Add Brand</button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50"><tr><th className="px-3 py-2">Brand</th><th className="px-3 py-2">Allocated person</th><th className="px-3 py-2">Action</th></tr></thead>
          <tbody>
            {allocations.map((allocation) => (
              <tr key={allocation.id} className="border-b last:border-0">
                <td className="px-3 py-2">{allocation.brand}</td>
                <td className="px-3 py-2">
                  <select
                    value={allocation.userId}
                    onChange={(event) => void save(allocations.map((candidate) => candidate.id === allocation.id ? { ...candidate, userId: event.target.value } : candidate))}
                    disabled={isBusy}
                    className={`${inputClass} min-w-52`}
                  >
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><button type="button" onClick={() => removeAllocation(allocation.id)} disabled={isBusy} className="text-sm text-destructive">Remove</button></td>
              </tr>
            ))}
            {allocations.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-muted-foreground">No brand allocations configured.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-5 overflow-x-auto rounded-md border">
        <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium">Request-level assignments</div>
        <table className="w-full text-left text-sm">
          <thead className="border-b"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Brand</th><th className="px-3 py-2">Assigned person</th></tr></thead>
          <tbody>
            {items.filter((item) => item.digitalMarketingStatus === "PENDING").map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{item.sku}</td>
                <td className="max-w-sm px-3 py-2">{item.description}</td>
                <td className="px-3 py-2">{item.digitalMarketingBrand ?? "Unmatched"}</td>
                <td className="px-3 py-2">
                  <select value={item.digitalMarketingAssigneeId ?? ""} onChange={(event) => void updateRequestAssignee(item.id, event.target.value)} disabled={isBusy} className={`${inputClass} min-w-52`}>
                    <option value="">Unassigned</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {items.filter((item) => item.digitalMarketingStatus === "PENDING").length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground">No pending Digital Marketing requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamWorkflowView({
  teamLabel,
  sections,
  isPending,
  onRefresh,
  onAction,
  vaultOs,
}: {
  teamLabel: string;
  sections: TeamSection[];
  isPending: boolean;
  onRefresh: () => void;
  onAction: (url: string, body?: unknown) => void;
  vaultOs: boolean;
}) {
  const isSkuSearchEnabled =
    sections.length > 0 &&
    sections.every(
      (section) =>
        section.team === "seo" ||
        section.team === "digitalMarketing" ||
        section.team === "purchasing"
    );
  const [skuSearch, setSkuSearch] = useState("");
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const normalizedSkuSearch = skuSearch.trim().toLowerCase();
  const visibleSections =
    isSkuSearchEnabled && normalizedSkuSearch
      ? sections.map((section) => ({
          ...section,
          items: section.items.filter((item) => item.sku.toLowerCase().includes(normalizedSkuSearch)),
        }))
      : sections;
  const total = visibleSections.reduce((sum, section) => sum + section.items.length, 0);
  const activeSections = visibleSections.filter((section) => section.items.length > 0);
  const bulkTeam = sections[0]?.team;
  const bulkItems = visibleSections
    .filter((section) => bulkTeam === "purchasing" || (bulkTeam === "stores" && section.title === "Transfer"))
    .flatMap((section) => section.items);
  const allBulkSelected = bulkItems.length > 0 && bulkItems.every((item) => selectedBulkIds.has(item.id));

  async function runBulkAction() {
    if (selectedBulkIds.size === 0) return;
    setBulkBusy(true);
    try {
      for (const item of bulkItems.filter((candidate) => selectedBulkIds.has(candidate.id))) {
        const url = bulkTeam === "purchasing"
          ? `/api/item-creation/${item.id}/pricing/update`
          : item.storeTransferStatus === "PENDING"
            ? `/api/item-creation/${item.id}/stores/sent`
            : `/api/item-creation/${item.id}/stores/received`;
        const response = await fetch(url, { method: "POST" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Bulk update failed");
        }
      }
      setSelectedBulkIds(new Set());
      onRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">{teamLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0
              ? "No active item creation requests are waiting in this team view."
              : `${total} request${total === 1 ? "" : "s"} need attention across the stages below.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSkuSearchEnabled && (
            <input
              value={skuSearch}
              onChange={(event) => setSkuSearch(event.target.value)}
              placeholder="Search SKU"
              className={`${inputClass} h-9 w-48`}
            />
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={onRefresh}
            className="h-9 rounded-md border bg-background px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>
          <span className="w-fit rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
            {total} Active
          </span>
        </div>
      </div>

      {bulkItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allBulkSelected}
              onChange={() => setSelectedBulkIds(allBulkSelected ? new Set() : new Set(bulkItems.map((item) => item.id)))}
            />
            Select all
          </label>
          <span className="text-sm text-muted-foreground">{selectedBulkIds.size} selected</span>
          <button
            type="button"
            disabled={bulkBusy || selectedBulkIds.size === 0}
            onClick={() => void runBulkAction()}
            className={primaryButtonClass}
          >
            {bulkBusy ? "Updating..." : bulkTeam === "purchasing" ? "Update selected prices" : "Mark selected"}
          </button>
        </div>
      )}

      <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleSections.map((section) => (
          <div key={section.title} className="rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{section.title}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={onRefresh}
                  className="h-8 rounded-md border px-2 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Refresh
                </button>
                <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-semibold">
                  {section.items.length}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{section.subtitle}</p>
          </div>
        ))}
      </div>

      <div className="p-4">
        {total === 0 ? (
          <div className="rounded-md border border-dashed bg-background p-8 text-center">
            <div className="text-base font-medium">Nothing waiting here</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch to another team view or create a new item request from the Admin view.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {activeSections.map((section) => (
              <div key={`active-${section.title}`} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold tracking-normal">{section.title}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={onRefresh}
                      className="h-8 rounded-md border px-2 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Refresh
                    </button>
                    <span className="text-sm text-muted-foreground">
                      {section.items.length} request{section.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                {section.team === "stores" && section.title === "Stock" ? (
                  <div className="space-y-4">
                    <CombinedStockRequestTableWithExistingItems items={section.items} onAction={onAction} />
                  </div>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {section.items.map((item) => (
                      <RequestCard
                        key={`${section.title}-${item.id}`}
                        item={item}
                        action={section.action(item)}
                        team={section.team}
                        selected={selectedBulkIds.has(item.id)}
                        onSelect={
                          (bulkTeam === "purchasing" || (bulkTeam === "stores" && section.title === "Transfer"))
                            ? (checked) => setSelectedBulkIds((current) => {
                                const next = new Set(current);
                                checked ? next.add(item.id) : next.delete(item.id);
                                return next;
                              })
                            : undefined
                        }
                        vaultOs={vaultOs}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={primaryButtonClass}>
      {children}
    </button>
  );
}

function CombinedStockRequestTable({
  items,
  onAction,
}: {
  items: ItemCreationItem[];
  onAction: (url: string, body?: unknown) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [supplier, setSupplier] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<Array<{ name: string; label: string }>>([]);
  const [options, setOptions] = useState<Array<StockOption & { erp: StockErp }>>([]);
  const [rows, setRows] = useState<Record<string, StockWarehouseRow[]>>({});
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [warehouseToAdd, setWarehouseToAdd] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const eligible = items.filter(
    (item) => item.seoSetupStatus !== "PENDING" && item.digitalMarketingStatus === "IMAGE_CREATED",
  );
  const allSelected = eligible.length > 0 && eligible.every((item) => selected.has(item.id));

  useEffect(() => {
    void Promise.all((['erp1', 'erp2'] as StockErp[]).map(async (erp) => {
      const res = await fetch(`/api/item-creation/stock/options?erp=${erp.toUpperCase()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load stock options");
      return (json.warehouses ?? [])
        .filter((option: StockOption) => {
          const name = option.name.toLowerCase();
          return name.includes("main") && !name.includes("shop");
        })
        .map((option: StockOption) => ({ ...option, label: option.name, erp }));
    })).then((loaded) => {
      const all = loaded.flat();
      setOptions(all);
      setRows((current) => {
        const next = { ...current };
        for (const item of eligible) {
          if (!next[item.id]) next[item.id] = all.map((option, index) => ({
            key: index + 1,
            warehouse: option.name,
            qty: "1",
            priority: option.priority ?? 2,
            erp: option.erp,
          }));
        }
        return next;
      });
    }).catch(() => undefined);
  }, [items]);

  useEffect(() => {
    void Promise.all((['ERP1', 'ERP2'] as const).map(async (erp) => {
      const response = await fetch(`/api/item-creation/stock/options?erp=${erp}`, { cache: "no-store" });
      if (!response.ok) return [] as Array<{ name: string; label: string }>;
      const data = (await response.json()) as { suppliers?: Array<{ name?: string; label?: string }> };
      return (data.suppliers ?? []).flatMap((option) => option.name || option.label
        ? [{ name: option.name || option.label!, label: option.label || option.name! }]
        : []);
    })).then((lists) => {
      const unique = new Map<string, { name: string; label: string }>();
      for (const option of lists.flat()) unique.set(option.name, option);
      setSupplierOptions([...unique.values()].sort((a, b) => a.label.localeCompare(b.label)));
    }).catch(() => setSupplierOptions([]));
  }, []);

  function itemRows(item: ItemCreationItem) { return rows[item.id] ?? []; }
  function configuredWarehouses() {
    return options.filter((option) => {
      const name = option.name.toLowerCase();
      return name.includes("main") && !name.includes("shop");
    });
  }
  function warehouseOptionKey(option: StockOption & { erp: StockErp }) {
    return `${option.erp}:${option.name}`;
  }
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function calculate(item: ItemCreationItem) {
    const total = Math.max(0, Math.floor(Number(totals[item.id]) || 0));
    const current = itemRows(item);
    const priorityFor = (row: StockWarehouseRow) =>
      Number(row.priority ?? options.find((option) => option.name === row.warehouse && option.erp === row.erp)?.priority ?? 2);
    let remaining = total;
    const values = new Map<string, number>();
    for (const row of current.filter((row) => priorityFor(row) === 1)) {
      const qty = Math.min(3, remaining);
      values.set(row.key.toString(), qty);
      remaining -= qty;
      if (remaining === 0) break;
    }
    const extra = allocateTakeQty(remaining, current.map((row) => ({
      key: row.key.toString(), need: 0, sales: 0, priority: priorityFor(row),
    })), false);
    for (const allocation of extra) values.set(allocation.key, (values.get(allocation.key) ?? 0) + allocation.qty);
    setRows((allRows) => ({ ...allRows, [item.id]: current.map((row) => ({ ...row, qty: String(values.get(row.key.toString()) ?? 0) })) }));
    setConfirmed((currentConfirmed) => { const next = new Set(currentConfirmed); next.delete(item.id); return next; });
  }
  function addWarehouse(item: ItemCreationItem) {
    const configured = configuredWarehouses();
    const current = itemRows(item);
    const selectedKey = warehouseToAdd[item.id];
    const warehouse = configured.find((option) => warehouseOptionKey(option) === selectedKey);
    if (!warehouse) return;
    if (current.some((row) => row.erp === warehouse.erp && row.warehouse === warehouse.name)) return;
    setRows((allRows) => ({
      ...allRows,
      [item.id]: [
        ...(allRows[item.id] ?? []),
        {
          key: Math.max(0, ...current.map((row) => row.key)) + 1,
          warehouse: warehouse.name,
          qty: "0",
          priority: warehouse.priority ?? 2,
          erp: warehouse.erp,
        },
      ],
    }));
    setConfirmed((currentConfirmed) => {
      const next = new Set(currentConfirmed);
      next.delete(item.id);
      return next;
    });
    setWarehouseToAdd((current) => ({ ...current, [item.id]: "" }));
  }
  function removeWarehouse(itemId: string, rowKey: number) {
    setRows((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).filter((entry) => entry.key !== rowKey),
    }));
    setConfirmed((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }
  function confirm(item: ItemCreationItem) {
    const total = Math.floor(Number(totals[item.id]));
    const sum = itemRows(item).reduce((value, row) => value + (Number(row.qty) || 0), 0);
    if (!Number.isFinite(total) || total < 0 || sum !== total) return;
    setConfirmed((current) => new Set(current).add(item.id));
  }
  function createReceipts() {
    const supplierId = supplierOptions.find((option) => option.label === supplier || option.name === supplier)?.name ?? supplier;
    const grouped = new Map<StockErp, { supplier: string; warehouses: Array<{ warehouse: string; company?: string; items: Array<{ itemRequestId: string; itemCode: string; qty: string; warehouse: string }> }> }>();
    for (const item of eligible.filter((candidate) => selected.has(candidate.id) && confirmed.has(candidate.id))) {
      for (const row of itemRows(item).filter((allocation) => Number(allocation.qty) > 0)) {
        const option = options.find((candidate) => candidate.name === row.warehouse && candidate.erp === row.erp);
        const erp = row.erp ?? option?.erp;
        if (!erp) continue;
        const payload = grouped.get(erp) ?? { supplier: supplierId, warehouses: [] };
        let warehouse = payload.warehouses.find((entry) => entry.warehouse === row.warehouse);
        if (!warehouse) { warehouse = { warehouse: row.warehouse, company: option?.company ?? undefined, items: [] }; payload.warehouses.push(warehouse); }
        warehouse.items.push({ itemRequestId: item.id, itemCode: item.sku, qty: row.qty, warehouse: row.warehouse });
        grouped.set(erp, payload);
      }
    }
    for (const [erp, payload] of grouped) onAction(`/api/item-creation/stock/${erp}`, payload);
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <label className="flex items-center gap-2 text-sm"><span>Supplier</span><input list="combined-item-stock-suppliers" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Search supplier" className={`${inputClass} w-64`} /><datalist id="combined-item-stock-suppliers">{supplierOptions.map((option) => <option key={option.name} value={option.label} label={option.name} />)}</datalist></label>
        <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(eligible.map((item) => item.id)))} className={secondaryButtonClass}>Select all</button>
        <span className="text-sm text-muted-foreground">{selected.size} selected</span>
        <button type="button" onClick={createReceipts} disabled={!supplier.trim()} className={primaryButtonClass}>Create Purchase Receipts</button>
      </div>
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Select</th><th className="px-3 py-2 text-left">SKU</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">Warehouse (ERP)</th><th className="px-3 py-2">Allocated Qty</th><th className="px-3 py-2 text-left">Company</th><th className="px-3 py-2">Action</th></tr></thead>
        <tbody>{items.map((item) => {
          const locked =
            item.seoSetupStatus === "PENDING" || item.digitalMarketingStatus !== "IMAGE_CREATED";
          const allocationRows = itemRows(item);
          const availableWarehouses = configuredWarehouses().filter(
            (option) => !allocationRows.some((row) => row.erp === option.erp && row.warehouse === option.name),
          );
          return <tr key={item.id} className="border-t align-top">
            <td className="px-3 py-3"><input type="checkbox" disabled={locked} checked={selected.has(item.id)} onChange={() => toggle(item.id)} /></td>
            <td className="px-3 py-3 font-semibold">{item.sku}</td><td className="px-3 py-3 text-muted-foreground">{item.description}</td>
            <td className="px-3 py-3">{locked ? "Waiting for Digital Marketing image" : <button type="button" onClick={() => onAction(`/api/item-creation/${item.id}/stores/stock-added`)} className={secondaryButtonClass}>Manual</button>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function CombinedStockRequestTableWithExistingItems({
  items,
  onAction,
}: {
  items: ItemCreationItem[];
  onAction: (url: string, body?: unknown) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [supplier, setSupplier] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<Array<{ name: string; label: string }>>([]);
  const [options, setOptions] = useState<Array<StockOption & { erp: StockErp }>>([]);
  const [optionsError, setOptionsError] = useState("");
  const [existingItems, setExistingItems] = useState<StockAllocationItem[]>([]);
  const [existingQuery, setExistingQuery] = useState("");
  const [lookupMatches, setLookupMatches] = useState<ExistingStockLookup[]>([]);
  const [lookupError, setLookupError] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [rows, setRows] = useState<Record<string, StockWarehouseRow[]>>({});
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [warehouseToAdd, setWarehouseToAdd] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [allocationErrors, setAllocationErrors] = useState<Record<string, string>>({});

  const workflowItems = items.filter(
    (item) => item.seoSetupStatus !== "PENDING" && item.digitalMarketingStatus === "IMAGE_CREATED",
  );
  const allocationItems: StockAllocationItem[] = [...workflowItems, ...existingItems];
  const isLocked = (item: StockAllocationItem) =>
    !item.isExisting && (item.seoSetupStatus === "PENDING" || item.digitalMarketingStatus !== "IMAGE_CREATED");
  const selectableItems = allocationItems.filter((item) => !isLocked(item));
  const allSelected = selectableItems.length > 0 && selectableItems.every((item) => selected.has(item.id));

  useEffect(() => {
    void Promise.all((['erp1', 'erp2'] as StockErp[]).map(async (erp) => {
      const response = await fetch(`/api/item-creation/stock/options?erp=${erp.toUpperCase()}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Failed to load stock options");
      return (data.warehouses ?? [])
        .filter((option: StockOption) => {
          const name = option.name.toLowerCase();
          return name.includes("main") && !name.includes("shop");
        })
        .map((option: StockOption) => ({ ...option, label: option.name, erp }));
    })).then((loaded) => {
      setOptions(loaded.flat());
      setOptionsError("");
    }).catch((error) => {
      setOptionsError(error instanceof Error ? error.message : "Failed to load stock options");
    });
  }, []);

  useEffect(() => {
    void Promise.all((['ERP1', 'ERP2'] as const).map(async (erp) => {
      const response = await fetch(`/api/item-creation/stock/options?erp=${erp}`, { cache: "no-store" });
      if (!response.ok) return [] as Array<{ name: string; label: string }>;
      const data = (await response.json()) as { suppliers?: Array<{ name?: string; label?: string }> };
      return (data.suppliers ?? []).flatMap((option) => option.name || option.label
        ? [{ name: option.name || option.label!, label: option.label || option.name! }]
        : []);
    })).then((lists) => {
      const unique = new Map<string, { name: string; label: string }>();
      for (const option of lists.flat()) unique.set(option.name, option);
      setSupplierOptions([...unique.values()].sort((a, b) => a.label.localeCompare(b.label)));
    });
  }, []);

  function configuredWarehouses(item?: StockAllocationItem) {
    return options.filter((option) => {
      if (item?.isExisting && item.erps?.length && !item.erps.includes(option.erp)) return false;
      if (item?.isExisting && !item.erps?.length && item.erp && option.erp !== item.erp) return false;
      const name = option.name.toLowerCase();
      return name.includes("main") && !name.includes("shop");
    });
  }

  useEffect(() => {
    if (options.length === 0) return;
    setRows((current) => {
      const next = { ...current };
      for (const item of allocationItems) {
        if (next[item.id]) continue;
        next[item.id] = configuredWarehouses(item).map((option, index) => ({
          key: index + 1,
          warehouse: option.name,
          qty: "0",
          priority: option.priority ?? 2,
          erp: option.erp,
        }));
      }
      return next;
    });
    // Rows are initialized only for newly visible items; existing row edits are preserved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, existingItems, options]);

  function itemRows(item: StockAllocationItem) {
    return rows[item.id] ?? [];
  }

  function warehouseOptionKey(option: StockOption & { erp: StockErp }) {
    return `${option.erp}:${option.name}`;
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function lookupExistingItem() {
    const query = existingQuery.trim();
    if (!query) return;
    setIsLookingUp(true);
    setLookupError("");
    setLookupMatches([]);
    try {
      const response = await fetch(`/api/item-creation/stock/lookup?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as { items?: ExistingStockLookup[]; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Existing item lookup failed");
      const matches = data?.items ?? [];
      setLookupMatches(matches);
      if (matches.length === 1) addExistingItem(matches[0]!);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Existing item lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  }

  function addExistingItem(match: ExistingStockLookup) {
    const erps = match.erps.map((value) => value.toLowerCase() as StockErp);
    const id = `existing:${match.itemCode}`;
    setExistingItems((current) => current.some((item) => item.id === id)
      ? current
      : [...current, {
          id,
          sku: match.itemCode,
          description: match.itemName,
          seoSetupStatus: "ITEM_CREATED",
          digitalMarketingStatus: "IMAGE_CREATED",
          isExisting: true,
          erp: erps.length === 1 ? erps[0] : undefined,
          erps,
          barcode: match.barcode,
          rop: match.rop,
          currentStock: match.currentStock,
          warehouseDetails: match.warehouseDetails.map((detail) => ({ ...detail, erp: detail.erp.toLowerCase() as StockErp })),
        }]);
    setSelected((current) => new Set(current).add(id));
    setLookupMatches((current) => current.filter((item) => item.itemCode !== match.itemCode));
    setExistingQuery("");
  }

  function updateRow(itemId: string, key: number, patch: Partial<StockWarehouseRow>) {
    setRows((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).map((row) => row.key === key ? { ...row, ...patch } : row),
    }));
    setConfirmed((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    setAllocationErrors((current) => ({ ...current, [itemId]: "" }));
  }

  function calculate(item: StockAllocationItem) {
    const total = Math.max(0, Math.floor(Number(totals[item.id]) || 0));
    const current = itemRows(item);
    let remaining = total;
    const values = new Map<string, number>();
    const priorityFor = (row: StockWarehouseRow) => row.priority ?? 2;
    for (const row of current.filter((entry) => priorityFor(entry) === 1)) {
      const qty = Math.min(3, remaining);
      values.set(String(row.key), qty);
      remaining -= qty;
      if (remaining === 0) break;
    }
    const extra = allocateTakeQty(remaining, current.map((row) => ({
      key: String(row.key),
      need: 0,
      sales: 0,
      priority: priorityFor(row),
    })), false);
    for (const allocation of extra) {
      values.set(allocation.key, (values.get(allocation.key) ?? 0) + allocation.qty);
    }
    setRows((allRows) => ({
      ...allRows,
      [item.id]: current.map((row) => ({ ...row, qty: String(values.get(String(row.key)) ?? 0) })),
    }));
    setConfirmed((currentConfirmed) => {
      const next = new Set(currentConfirmed);
      next.delete(item.id);
      return next;
    });
    setAllocationErrors((current) => ({ ...current, [item.id]: "" }));
  }

  function addWarehouse(item: StockAllocationItem) {
    const selectedKey = warehouseToAdd[item.id];
    const warehouse = configuredWarehouses(item).find((option) => warehouseOptionKey(option) === selectedKey);
    if (!warehouse) return;
    const current = itemRows(item);
    if (current.some((row) => row.erp === warehouse.erp && row.warehouse === warehouse.name)) return;
    setRows((allRows) => ({
      ...allRows,
      [item.id]: [...(allRows[item.id] ?? []), {
        key: Math.max(0, ...current.map((row) => row.key)) + 1,
        warehouse: warehouse.name,
        qty: "0",
        priority: warehouse.priority ?? 2,
        erp: warehouse.erp,
      }],
    }));
    setWarehouseToAdd((currentValues) => ({ ...currentValues, [item.id]: "" }));
    setConfirmed((currentConfirmed) => {
      const next = new Set(currentConfirmed);
      next.delete(item.id);
      return next;
    });
    setAllocationErrors((current) => ({ ...current, [item.id]: "" }));
  }

  function removeWarehouse(itemId: string, rowKey: number) {
    setRows((current) => ({ ...current, [itemId]: (current[itemId] ?? []).filter((row) => row.key !== rowKey) }));
    setConfirmed((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    setAllocationErrors((current) => ({ ...current, [itemId]: "" }));
  }

  function confirm(item: StockAllocationItem) {
    const total = Math.floor(Number(totals[item.id]));
    const allocated = itemRows(item).reduce((sum, row) => sum + Math.max(0, Number(row.qty) || 0), 0);
    if (!Number.isFinite(total) || total <= 0) {
      setAllocationErrors((current) => ({ ...current, [item.id]: "Enter a total quantity greater than zero." }));
      return;
    }
    if (allocated !== total) {
      setAllocationErrors((current) => ({
        ...current,
        [item.id]: `Allocated quantity does not match the total (${allocated} of ${total}).`,
      }));
      return;
    }
    setAllocationErrors((current) => ({ ...current, [item.id]: "" }));
    setConfirmed((current) => new Set(current).add(item.id));
  }

  function createReceipts() {
    const supplierId = supplierOptions.find((option) => option.label === supplier || option.name === supplier)?.name ?? supplier.trim();
    const grouped = new Map<StockErp, {
      supplier: string;
      warehouses: Array<{
        warehouse: string;
        company?: string;
        items: Array<{ itemRequestId?: string; itemCode: string; qty: string; warehouse: string }>;
      }>;
    }>();
    for (const item of selectableItems.filter((candidate) => selected.has(candidate.id) && confirmed.has(candidate.id))) {
      for (const row of itemRows(item).filter((allocation) => allocation.warehouse.trim() && Number(allocation.qty) > 0)) {
        const erp = row.erp ?? item.erp;
        if (!erp) continue;
        const option = options.find((candidate) => candidate.name === row.warehouse && candidate.erp === erp);
        const payload = grouped.get(erp) ?? { supplier: supplierId, warehouses: [] };
        let warehouse = payload.warehouses.find((entry) => entry.warehouse === row.warehouse);
        if (!warehouse) {
          warehouse = { warehouse: row.warehouse, company: option?.company ?? undefined, items: [] };
          payload.warehouses.push(warehouse);
        }
        warehouse.items.push({
          ...(item.isExisting ? {} : { itemRequestId: item.id }),
          itemCode: item.sku,
          qty: row.qty,
          warehouse: row.warehouse,
        });
        grouped.set(erp, payload);
      }
    }
    for (const [erp, payload] of grouped) onAction(`/api/item-creation/stock/${erp}`, payload);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="space-y-3 border-b p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span>Supplier</span>
            <input list="combined-item-stock-suppliers" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Search supplier" className={`${inputClass} w-64`} />
            <datalist id="combined-item-stock-suppliers">{supplierOptions.map((option) => <option key={option.name} value={option.label} label={option.name} />)}</datalist>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span>Existing item</span>
            <input
              value={existingQuery}
              onChange={(event) => setExistingQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void lookupExistingItem(); } }}
              placeholder="Search SKU or barcode"
              className={`${inputClass} w-64`}
            />
          </label>
          <button type="button" onClick={() => void lookupExistingItem()} disabled={isLookingUp || !existingQuery.trim()} className={secondaryButtonClass}>
            {isLookingUp ? "Searching..." : "Add existing item"}
          </button>
          <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(selectableItems.map((item) => item.id)))} className={secondaryButtonClass}>
            Select all
          </button>
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <button
            type="button"
            onClick={createReceipts}
            disabled={!supplier.trim() || selectableItems.filter((item) => selected.has(item.id)).some((item) => !confirmed.has(item.id))}
            className={primaryButtonClass}
          >
            Create Purchase Receipts
          </button>
        </div>
        {(lookupError || optionsError) && <p className="text-sm text-destructive">{lookupError || optionsError}</p>}
        {lookupMatches.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2 text-sm">
            <span className="self-center text-muted-foreground">Select an ERP item:</span>
            {lookupMatches.map((match) => (
              <button key={match.itemCode} type="button" onClick={() => addExistingItem(match)} className={secondaryButtonClass}>
                {match.itemCode} ({match.erps.join(" + ")})
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Select</th><th className="px-3 py-2 text-left">SKU</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">Warehouse (ERP)</th><th className="px-3 py-2">Allocated Qty</th><th className="px-3 py-2 text-left">Company</th><th className="px-3 py-2">Action</th></tr>
          </thead>
          <tbody>
            {allocationItems.map((item) => {
              const locked = isLocked(item);
              const allocationRows = itemRows(item);
              const availableWarehouses = configuredWarehouses(item).filter(
                (option) => !allocationRows.some((row) => row.erp === option.erp && row.warehouse === option.name),
              );
              return (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-3"><input type="checkbox" disabled={locked} checked={selected.has(item.id)} onChange={() => toggle(item.id)} /></td>
                  <td className="px-3 py-3 font-semibold">{item.sku}{item.isExisting && <span className="mt-1 block text-xs font-normal text-muted-foreground">Existing {item.erps?.map((erp) => erp.toUpperCase()).join(" + ")}</span>}</td>
                  <td className="px-3 py-3 text-muted-foreground">{item.description}</td>
                  <td className="px-3 py-3" colSpan={3}>
                    {locked ? <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">Waiting for Digital Marketing image</div> : (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
                          <label className="text-sm font-medium">Total qty</label>
                          <input value={totals[item.id] ?? ""} onChange={(event) => { setTotals((current) => ({ ...current, [item.id]: event.target.value })); setConfirmed((current) => { const next = new Set(current); next.delete(item.id); return next; }); setAllocationErrors((current) => ({ ...current, [item.id]: "" })); }} type="number" min="1" step="1" className={`${inputClass} w-32`} />
                          <button type="button" onClick={() => calculate(item)} className={secondaryButtonClass}>Calculate allocation</button>
                          <button type="button" onClick={() => confirm(item)} disabled={confirmed.has(item.id)} className={secondaryButtonClass}>{confirmed.has(item.id) ? "Allocation confirmed" : "Confirm allocation"}</button>
                        </div>
                        {allocationErrors[item.id] && <p className="text-sm text-destructive">{allocationErrors[item.id]}</p>}
                        {allocationRows.map((row) => {
                          const warehouse = options.find((option) => option.name === row.warehouse && option.erp === row.erp);
                          const warehouseDetail = item.warehouseDetails?.find((detail) => detail.warehouse === row.warehouse && detail.erp === row.erp);
                          return (
                            <div key={row.key} className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_120px_minmax(180px,1fr)_auto]">
                              <select value={row.warehouse} onChange={(event) => updateRow(item.id, row.key, { warehouse: event.target.value })} className={inputClass}>
                                <option value="">Select warehouse</option>
                                {configuredWarehouses(item).map((option) => <option key={warehouseOptionKey(option)} value={option.name}>{option.name} ({option.erp.toUpperCase()})</option>)}
                              </select>
                              <input value={row.qty} onChange={(event) => updateRow(item.id, row.key, { qty: event.target.value })} type="number" min="0" step="1" className={inputClass} />
                              <div className="min-h-10 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                <div>{warehouse?.company || "-"}</div>
                                {item.isExisting && <div>Barcode: {warehouseDetail?.barcode || item.barcode || "-"}</div>}
                                {item.isExisting && <div>ROP: {warehouseDetail?.rop ?? 0} | Stock: {warehouseDetail?.stock ?? "Unavailable"}</div>}
                              </div>
                              <button type="button" onClick={() => removeWarehouse(item.id, row.key)} className={secondaryButtonClass}>Remove</button>
                            </div>
                          );
                        })}
                        <div className="flex flex-wrap items-center gap-2">
                          <select value={warehouseToAdd[item.id] ?? ""} onChange={(event) => setWarehouseToAdd((current) => ({ ...current, [item.id]: event.target.value }))} className={`${inputClass} min-w-64`}>
                            <option value="">Add warehouse</option>
                            {availableWarehouses.map((option) => <option key={warehouseOptionKey(option)} value={warehouseOptionKey(option)}>{option.name} ({option.erp.toUpperCase()})</option>)}
                          </select>
                          <button type="button" onClick={() => addWarehouse(item)} className={secondaryButtonClass}>Add warehouse</button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">{item.isExisting ? <span className="text-xs text-muted-foreground">Existing item</span> : <button type="button" onClick={() => onAction(`/api/item-creation/${item.id}/stores/stock-added`)} className={secondaryButtonClass}>Manual</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockRequestTable({
  title,
  erp,
  items,
  onAction,
  hideCreateButton = false,
  registerCreate,
}: {
  title: string;
  erp: StockErp;
  items: ItemCreationItem[];
  onAction: (url: string, body?: unknown) => void;
  hideCreateButton?: boolean;
  registerCreate?: (create: () => void) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [supplier, setSupplier] = useState("");
  const [rows, setRows] = useState<Record<string, StockWarehouseRow[]>>({});
  const [totalQty, setTotalQty] = useState<Record<string, string>>({});
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [optionsByErp, setOptionsByErp] = useState<Partial<Record<StockErp, StockOptions>>>({});
  const [optionsError, setOptionsError] = useState("");
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const options = optionsByErp[erp] ?? { suppliers: [], warehouses: [] };
  const eligibleItems = items.filter((item) => item.seoSetupStatus !== "PENDING");
  const allSelected = eligibleItems.length > 0 && eligibleItems.every((item) => selectedIds.has(item.id));

  useEffect(() => {
    void loadOptions(erp);
    // The ERP section owns its option loading and only changes when its ERP changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erp]);

  async function loadOptions(nextErp: StockErp) {
    if (optionsByErp[nextErp]) return;
    setIsLoadingOptions(true);
    setOptionsError("");
    try {
      const res = await fetch(`/api/item-creation/stock/options?erp=${nextErp.toUpperCase()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to load ERP stock options");
      const loadedOptions = json as StockOptions;
      setOptionsByErp((current) => ({ ...current, [nextErp]: loadedOptions }));
      setRows((current) => {
        const mainWarehouses = loadedOptions.warehouses.filter((option) =>
          option.name.toLowerCase().includes("main")
        );
        const next = { ...current };
        for (const item of eligibleItems) {
          if (next[item.id]) continue;
          next[item.id] = mainWarehouses.map((warehouse, index) => ({
            key: index + 1,
            warehouse: warehouse.name,
            qty: "1",
            priority: warehouse.priority ?? 2,
          }));
        }
        return next;
      });
    } catch (error) {
      setOptionsError(error instanceof Error ? error.message : "Failed to load ERP stock options");
    } finally {
      setIsLoadingOptions(false);
    }
  }

  function rowFor(item: ItemCreationItem) {
    return rows[item.id] ?? [];
  }

  function updateRow(itemId: string, key: number, patch: Partial<StockWarehouseRow>) {
    setRows((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? [{ key: 1, warehouse: "", qty: "1" }]).map((row) =>
        row.key === key ? { ...row, ...patch } : row
      ),
    }));
  }

  function calculateAllocation(itemId: string) {
    const requested = Number(totalQty[itemId]);
    const allocations = rowFor(items.find((item) => item.id === itemId)!);
    if (!Number.isFinite(requested) || requested < 0 || allocations.length === 0) return;
    const safeTotal = Math.floor(requested);
    const priorityOne = allocations.filter((row) => (row.priority ?? 2) === 1);
    const guaranteed = new Map<string, number>();
    let remaining = safeTotal;
    for (const row of priorityOne) {
      const qty = Math.min(3, remaining);
      guaranteed.set(row.warehouse, (guaranteed.get(row.warehouse) ?? 0) + qty);
      remaining -= qty;
      if (remaining <= 0) break;
    }
    const extra = allocateTakeQty(
      remaining,
      allocations.map((row) => ({ key: row.warehouse, need: 0, sales: 0, priority: row.priority ?? 2 })),
    );
    const extraByWarehouse = new Map(extra.map((allocation) => [allocation.key, allocation.qty]));
    setRows((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).map((row) => ({
        ...row,
        qty: String((guaranteed.get(row.warehouse) ?? 0) + (extraByWarehouse.get(row.warehouse) ?? 0)),
      })),
    }));
    setConfirmedIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }

  function confirmAllocation(itemId: string) {
    const requested = Math.floor(Number(totalQty[itemId]));
    const allocated = rowFor(items.find((item) => item.id === itemId)!).reduce(
      (sum, row) => sum + Math.max(0, Number(row.qty) || 0),
      0,
    );
    if (!Number.isFinite(requested) || requested < 0 || allocated !== requested) return;
    setConfirmedIds((current) => new Set(current).add(itemId));
  }

  function removeAllocation(itemId: string, key: number) {
    setRows((current) => {
      return {
        ...current,
        [itemId]: (current[itemId] ?? []).filter((row) => row.key !== key),
      };
    });
  }

  function toggleItem(item: ItemCreationItem) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        if (item.seoSetupStatus !== "PENDING") next.add(item.id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) => {
      if (eligibleItems.every((item) => current.has(item.id))) return new Set();
      return new Set(eligibleItems.map((item) => item.id));
    });
  }

  function createPr() {
    const selectedItems = items.filter((item) => selectedIds.has(item.id) && item.seoSetupStatus !== "PENDING");
    if (selectedItems.length === 0 || selectedItems.some((item) => !confirmedIds.has(item.id))) return;
    const grouped = new Map<string, {
      warehouse: string;
      company?: string;
      items: Array<{ itemRequestId: string; itemCode: string; qty: string; warehouse: string }>;
    }>();

    for (const item of selectedItems) {
      for (const row of rowFor(item).filter((allocation) => allocation.warehouse.trim())) {
        const warehouse = options.warehouses.find((option) => option.name === row.warehouse);
        const companyKey = warehouse?.company || row.warehouse;
        const existing = grouped.get(companyKey) ?? {
          warehouse: row.warehouse,
          company: warehouse?.company || undefined,
          items: [],
        };
        existing.items.push({
          itemRequestId: item.id,
          itemCode: item.sku,
          qty: row.qty,
          warehouse: row.warehouse,
        });
        grouped.set(companyKey, existing);
      }
    }

    onAction(`/api/item-creation/stock/${erp}`, {
      supplier,
      warehouses: Array.from(grouped.values()),
    });
  }

  useEffect(() => {
    registerCreate?.(createPr);
  });

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="grid gap-3 border-b p-3 lg:grid-cols-[140px_minmax(220px,1fr)_auto] lg:items-center">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold">
          {title}
        </div>
        <input
          list={`${erp}-stock-suppliers`}
          value={supplier}
          onFocus={() => void loadOptions(erp)}
          onChange={(event) => setSupplier(event.target.value)}
          placeholder="Search supplier"
          className={inputClass}
        />
        <datalist id={`${erp}-stock-suppliers`}>
          {options.suppliers.map((option) => (
            <option key={option.name} value={option.name} label={option.label} />
          ))}
        </datalist>
        {!hideCreateButton && selectedIds.size > 0 && !selectedItemsNotConfirmed(selectedIds, confirmedIds, items) && (
          <ActionButton onClick={createPr}>Create Purchase Receipts</ActionButton>
        )}
      </div>
      {(isLoadingOptions || optionsError) && (
        <div className="border-b px-3 py-2 text-sm">
          {isLoadingOptions && <span className="text-muted-foreground">Loading ERP options...</span>}
          {optionsError && <span className="text-destructive">{optionsError}</span>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-2 text-left">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Warehouse</th>
              <th className="w-32 px-3 py-2 text-left">Allocated Qty</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="w-28 px-3 py-2 text-left">Manual</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const allocationRows = rowFor(item);
              const isLocked = item.seoSetupStatus === "PENDING";
              return (
                <tr key={item.id} className="border-t align-middle">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      disabled={isLocked}
                      onChange={() => toggleItem(item)}
                    />
                  </td>
                  <td className="px-3 py-2 font-semibold">{item.sku}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.description}</td>
                  <td className="px-3 py-2" colSpan={3}>
                    {isLocked ? (
                      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                        Waiting for item created
                      </div>
                    ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
                        <label className="text-sm font-medium">Total qty</label>
                        <input
                          value={totalQty[item.id] ?? ""}
                          onChange={(event) => {
                            setTotalQty((current) => ({ ...current, [item.id]: event.target.value }));
                            setConfirmedIds((current) => {
                              const next = new Set(current);
                              next.delete(item.id);
                              return next;
                            });
                          }}
                          type="number"
                          min="0"
                          step="1"
                          className={`${inputClass} w-32`}
                        />
                        <button type="button" onClick={() => calculateAllocation(item.id)} className={secondaryButtonClass}>
                          Calculate allocation
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmAllocation(item.id)}
                          disabled={confirmedIds.has(item.id)}
                          className={secondaryButtonClass}
                        >
                          {confirmedIds.has(item.id) ? "Allocation confirmed" : "Confirm allocation"}
                        </button>
                      </div>
                      {allocationRows.map((row) => {
                        const selectedWarehouse = options.warehouses.find((option) => option.name === row.warehouse);
                        return (
                          <div key={row.key} className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_120px_minmax(180px,1fr)_auto]">
                            <select
                              value={row.warehouse}
                              onFocus={() => void loadOptions(erp)}
                              onChange={(event) => updateRow(item.id, row.key, { warehouse: event.target.value })}
                              className={inputClass}
                            >
                              <option value="">Select warehouse</option>
                              {options.warehouses.filter((option) => {
                                const name = option.name.toLowerCase();
                                return name.includes("main") && !name.includes("shop");
                              }).map((option) => (
                                <option key={option.name} value={option.name}>
                                  {option.label}
                                  {option.company ? ` - ${option.company}` : ""}
                                </option>
                              ))}
                            </select>
                            <input
                              value={row.qty}
                              onChange={(event) => {
                                updateRow(item.id, row.key, { qty: event.target.value });
                                setConfirmedIds((current) => {
                                  const next = new Set(current);
                                  next.delete(item.id);
                                  return next;
                                });
                              }}
                              type="number"
                              min="0"
                              step="0.01"
                              className={inputClass}
                            />
                            <div className="flex min-h-10 items-center rounded-md border bg-muted/20 px-3 text-muted-foreground">
                              {selectedWarehouse?.company || "-"}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAllocation(item.id, row.key)}
                              className={secondaryButtonClass}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onAction(`/api/item-creation/${item.id}/stores/stock-added`)}
                      className={secondaryButtonClass}
                    >
                      Manual
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockReceiptAction({
  item,
  onAction,
}: {
  item: ItemCreationItem;
  onAction: (url: string, body?: unknown) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [erp, setErp] = useState<StockErp>("erp1");
  const [supplier, setSupplier] = useState("");
  const [rows, setRows] = useState<StockWarehouseRow[]>([
    { key: 1, warehouse: "", qty: "1" },
  ]);
  const [optionsByErp, setOptionsByErp] = useState<Partial<Record<StockErp, StockOptions>>>({});
  const [optionsError, setOptionsError] = useState("");
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const options = optionsByErp[erp] ?? { suppliers: [], warehouses: [] };

  async function loadOptions(nextErp: StockErp) {
    if (optionsByErp[nextErp]) return;
    setIsLoadingOptions(true);
    setOptionsError("");
    try {
      const res = await fetch(`/api/item-creation/stock/options?erp=${nextErp.toUpperCase()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to load ERP stock options");
      setOptionsByErp((current) => ({ ...current, [nextErp]: json as StockOptions }));
    } catch (error) {
      setOptionsError(error instanceof Error ? error.message : "Failed to load ERP stock options");
    } finally {
      setIsLoadingOptions(false);
    }
  }

  function updateRow(key: number, patch: Partial<StockWarehouseRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addWarehouseRow() {
    setRows((current) => [
      ...current,
      { key: Math.max(0, ...current.map((row) => row.key)) + 1, warehouse: "", qty: "1" },
    ]);
  }

  function removeWarehouseRow(key: number) {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.key !== key)));
  }

  function submit() {
    const warehouses = rows.map((row) => {
      const warehouse = options.warehouses.find((option) => option.name === row.warehouse);
      return {
        warehouse: row.warehouse,
        company: warehouse?.company || undefined,
        items: [
          {
            itemRequestId: item.id,
            itemCode: item.sku,
            qty: row.qty,
          },
        ],
      };
    });
    onAction(`/api/item-creation/stock/${erp}`, {
      supplier,
      warehouses,
    });
    setIsOpen(false);
  }

  return (
    <>
      <ActionButton
        onClick={() => {
          setIsOpen(true);
          void loadOptions(erp);
        }}
      >
        Create PR
      </ActionButton>
      <button
        type="button"
        onClick={() => onAction(`/api/item-creation/${item.id}/stores/stock-added`)}
        className={secondaryButtonClass}
      >
        Manual
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border bg-background p-5 shadow-2xl">
            <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Create Purchase Receipt</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.sku} - {item.description}
                </p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className={secondaryButtonClass}>
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr]">
              <select
                value={erp}
                onChange={(event) => {
                  const nextErp = event.target.value as StockErp;
                  setErp(nextErp);
                  setSupplier("");
                  setRows([{ key: 1, warehouse: "", qty: "1" }]);
                  void loadOptions(nextErp);
                }}
                className={inputClass}
              >
                <option value="erp1">ERP1</option>
                <option value="erp2">ERP2</option>
              </select>
              <input
                list={`stock-modal-suppliers-${erp}`}
                value={supplier}
                onFocus={() => void loadOptions(erp)}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="Search supplier"
                className={inputClass}
              />
              <datalist id={`stock-modal-suppliers-${erp}`}>
                {options.suppliers.map((option) => (
                  <option key={option.name} value={option.name} label={option.label} />
                ))}
              </datalist>
            </div>

            {isLoadingOptions && <p className="mt-3 text-sm text-muted-foreground">Loading ERP options...</p>}
            {optionsError && <p className="mt-3 text-sm text-destructive">{optionsError}</p>}

            <div className="mt-4 space-y-3">
              {rows.map((row, index) => {
                const selectedWarehouse = options.warehouses.find((option) => option.name === row.warehouse);
                return (
                  <div key={row.key} className="rounded-md border bg-muted/20 p-3">
                    <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_140px_auto]">
                      <select
                        value={row.warehouse}
                        onChange={(event) => updateRow(row.key, { warehouse: event.target.value })}
                        className={inputClass}
                      >
                        <option value="">Select warehouse</option>
                        {options.warehouses.map((option) => (
                          <option key={option.name} value={option.name}>
                            {option.label}
                            {option.company ? ` - ${option.company}` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        value={row.qty}
                        onChange={(event) => updateRow(row.key, { qty: event.target.value })}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Qty"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => removeWarehouseRow(row.key)}
                        disabled={rows.length === 1}
                        className={secondaryButtonClass}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      PR {index + 1} company: {selectedWarehouse?.company || "selected warehouse company"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={addWarehouseRow} className={secondaryButtonClass}>
                Add Warehouse
              </button>
              <ActionButton onClick={submit}>Create Purchase Receipts</ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-md border bg-muted px-2.5 py-1 text-xs font-medium">
      {status(value)}
    </span>
  );
}

function DriveLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">Waiting for image</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline"
    >
      Open Google Drive
    </a>
  );
}

function RequestCard({
  item,
  action,
  team,
  selected,
  onSelect,
  vaultOs,
}: {
  item: ItemCreationItem;
  action: ReactNode;
  team: WorkTeamView;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  vaultOs: boolean;
}) {
  const priceStatus = getPriceStatus(item);
  const showPrices = team === "purchasing";
  const showStock = team === "stores";
  const showImage = team === "seo" || team === "digitalMarketing";
  const showDigitalAssignee = team === "digitalMarketing";
  const needsErp2 = item.creationSources.includes("ERP2");
  const needsErp1Ogf = item.addErp1OgfPrice || (item.ogfPrice !== null && !needsErp2);
  const ogfTarget = needsErp1Ogf
    ? `ERP1 ${money(item.erp1OgfPrice)}`
    : needsErp2
      ? `ERP2 ${money(item.erpOgfPrice)}`
      : "Not required";
  const ogfTally = needsErp1Ogf
    ? getOgfPriceTally({ ogfPrice: item.ogfPrice, erpOgfPrice: item.erp1OgfPrice })
    : needsErp2
      ? getOgfPriceTally(item)
      : "NOT_REQUIRED";
  return (
    <div className="rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {onSelect && (
              <input
                type="checkbox"
                checked={Boolean(selected)}
                onChange={(event) => onSelect(event.target.checked)}
                aria-label={`Select ${item.sku}`}
              />
            )}
            <span className="font-semibold">{item.sku}</span>
            <StatusPill value={item.overallStatus} />
          </div>
          <div className="mt-1 text-muted-foreground">{item.description}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {item.country}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      </div>

      {(showPrices || showStock || showImage) && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {showPrices && <InfoBlock label="Price Status" value={PRICE_STATUS_LABELS[priceStatus]} />}
          {showStock && <InfoBlock label="Stock Status" value={status(item.storeStockStatus)} />}
          {showImage && <InfoBlock label="Google Drive" value={<DriveLink url={item.imageDriveUrl} />} />}
          {showDigitalAssignee && (
            <InfoBlock
              label="Assigned to"
              value={
                item.digitalMarketingAssignee?.knownName?.trim() ||
                item.digitalMarketingAssignee?.name?.trim() ||
                item.digitalMarketingAssignee?.email?.trim() ||
                "Unassigned"
              }
            />
          )}
        </div>
      )}

      {showPrices && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {!vaultOs && <InfoBlock
            label="Standard Price"
            value={`${money(item.standardPrice)} / ERP ${money(item.erpStandardPrice)} (${getStandardPriceTally(item)})`}
          />}
          {!vaultOs && <InfoBlock
            label="OGF Price"
            value={`${money(item.ogfPrice)} / ${ogfTarget} (${ogfTally})`}
          />}
          <InfoBlock
            label="ERP1 OGF"
            value={needsErp1Ogf ? money(item.erp1OgfPrice) : "Not required"}
          />
          {!vaultOs && needsErp2 && (
            <InfoBlock
              label="GCC Price"
              value={`${money(item.gccPrice)} / ERP2 ${money(item.erp2GccPrice)} (${getGccPriceTally(item)})`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words">{value}</div>
    </div>
  );
}

function DigitalAction({
  item,
  onAction,
}: {
  item: ItemCreationItem;
  onAction: (url: string, body?: unknown) => void;
}) {
  const [imageDriveUrl, setImageDriveUrl] = useState(item.imageDriveUrl ?? "");
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <input
        value={imageDriveUrl}
        onChange={(event) => setImageDriveUrl(event.target.value)}
        placeholder="Google Drive URL"
        className={`${inputClass} min-w-64`}
      />
      <ActionButton
        onClick={() =>
          onAction(`/api/item-creation/${item.id}/digital-marketing/image-created`, {
            imageDriveUrl,
          })
        }
      >
        Mark Image Created
      </ActionButton>
    </div>
  );
}

function AdminTable({
  items,
  isPending,
  readOnly,
  onDelete,
  onUpdate,
  onAction,
  onRefresh,
  vaultOs,
}: {
  items: ItemCreationItem[];
  isPending: boolean;
  readOnly: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, body: unknown) => void;
  onAction: (url: string, body?: unknown) => void;
  onRefresh: () => void;
  vaultOs: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listView, setListView] = useState<"active" | "history">("active");
  const [now, setNow] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Omit<CreateRow, "key" | "creationSources">>({
    sku: "",
    description: "",
    standardPrice: "",
    ogfPrice: "",
    gccPrice: "",
    addErp1OgfPrice: false,
    country: "",
    taxStatus: "Vat / Non Vat",
  });

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  function startEdit(item: ItemCreationItem) {
    setEditingId(item.id);
    setEditRow({
      sku: item.sku,
      description: item.description,
      standardPrice: String(item.standardPrice),
      ogfPrice: item.ogfPrice === null ? "" : String(item.ogfPrice),
      gccPrice: item.gccPrice === null ? "" : String(item.gccPrice),
      addErp1OgfPrice: item.addErp1OgfPrice,
      country: item.country,
      taxStatus: item.taxStatus,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(id: string) {
    onUpdate(id, editRow);
    setEditingId(null);
  }

  function confirmDelete(item: ItemCreationItem) {
    if (window.confirm(`Delete Item Creation request for ${item.sku}?`)) {
      onDelete(item.id);
    }
  }

  const activeItems = items.filter((item) => item.overallStatus !== "COMPLETED");
  const historyItems = items.filter((item) => item.overallStatus === "COMPLETED");
  const visibleItems = listView === "active" ? activeItems : historyItems;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">
            {listView === "active" ? "Active Requests" : "Item History"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {listView === "active"
              ? "New and in-progress item creation requests."
              : "Completed item creation requests retained for admin history."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onRefresh}
            className="h-9 rounded-md border bg-background px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>
          <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium">
            {visibleItems.length}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b p-2">
        <button
          type="button"
          onClick={() => setListView("active")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            listView === "active" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          Active ({activeItems.length})
        </button>
        <button
          type="button"
          onClick={() => setListView("history")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            listView === "history" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          }`}
        >
          History ({historyItems.length})
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {[
                "SKU",
                "Description",
                "Country",
                "ERP2 Creation",
                "SEO Setup",
                "Digital Marketing",
                "Purchasing",
                "Store Transfer",
                "Store Stock",
                "SEO Activation",
                "Overall Status",
                "Current Stage Age",
                "Total Time",
                "Created At",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="px-3 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <tr key={item.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-3 font-medium">
                    {isEditing ? (
                      <input
                        value={editRow.sku}
                        onChange={(event) => setEditRow((row) => ({ ...row, sku: event.target.value }))}
                        className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                      />
                    ) : (
                      item.sku
                    )}
                  </td>
                  <td className="max-w-72 px-3 py-3">
                    {isEditing ? (
                      <input
                        value={editRow.description}
                        onChange={(event) => setEditRow((row) => ({ ...row, description: event.target.value }))}
                        className="h-9 w-64 rounded-md border bg-background px-2 text-sm"
                      />
                    ) : (
                      item.description
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {isEditing ? (
                      <input
                        value={editRow.country}
                        onChange={(event) => setEditRow((row) => ({ ...row, country: event.target.value }))}
                        className="h-9 w-28 rounded-md border bg-background px-2 text-sm"
                      />
                    ) : (
                      item.country
                    )}
                    {isEditing && (
                      <div className="mt-2 grid gap-2">
                        <input
                          value={editRow.standardPrice}
                          onChange={(event) => setEditRow((row) => ({ ...row, standardPrice: event.target.value }))}
                          type="number"
                          step="0.01"
                          placeholder="Standard Price"
                          className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                        />
                        {!vaultOs && <input
                          value={editRow.ogfPrice}
                          onChange={(event) => setEditRow((row) => ({ ...row, ogfPrice: event.target.value }))}
                          type="number"
                          step="0.01"
                          placeholder="OGF Price"
                          className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                        />}
                        {!vaultOs && <input
                          value={editRow.gccPrice}
                          onChange={(event) => setEditRow((row) => ({ ...row, gccPrice: event.target.value }))}
                          type="number"
                          step="0.01"
                          placeholder="GCC Price"
                          className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                        />}
                        {!vaultOs && <label className="flex w-fit items-center gap-2 rounded-md border bg-background px-2 py-2 text-xs font-medium text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={editRow.addErp1OgfPrice}
                            onChange={(event) =>
                              setEditRow((row) => ({ ...row, addErp1OgfPrice: event.target.checked }))
                            }
                            className="size-4"
                          />
                          Add OGF to ERP1
                        </label>}
                        <select
                          value={editRow.taxStatus}
                          onChange={(event) => setEditRow((row) => ({ ...row, taxStatus: event.target.value }))}
                          aria-label="Tax status"
                          className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
                        >
                          {ITEM_CREATION_TAX_STATUS_VALUES.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill value={item.erp2ItemCreationStatus} />
                        {!readOnly && item.erp2ItemCreationStatus === "FAILED" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              onAction(`/api/item-creation/${item.id}/erp2/retry-item-creation`)
                            }
                            className="h-8 rounded-md border border-amber-400/50 px-3 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-200 dark:hover:bg-amber-950/30"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                      {item.erp2ItemCode && (
                        <span className="text-xs text-muted-foreground">
                          {item.erp2ItemCode}
                        </span>
                      )}
                      {item.erp2ItemCreationStatus === "FAILED" && item.erp2ItemCreationError && (
                        <span className="max-w-56 text-xs text-destructive">
                          {item.erp2ItemCreationError}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3"><StageStatus item={item} stage="seo" value={item.seoSetupStatus} now={now} /></td>
                  <td className="px-3 py-3"><StageStatus item={item} stage="digital" value={item.digitalMarketingStatus} now={now} /></td>
                  <td className="px-3 py-3"><StageStatus item={item} stage="purchasing" value={item.purchasingStatus} now={now} /></td>
                  <td className="px-3 py-3"><StageStatus item={item} stage="transfer" value={item.storeTransferStatus} now={now} /></td>
                  <td className="px-3 py-3"><StageStatus item={item} stage="stock" value={item.storeStockStatus} now={now} /></td>
                  <td className="px-3 py-3"><StageStatus item={item} stage="activation" value={item.seoActivationStatus} now={now} /></td>
                  <td className="px-3 py-3"><StatusPill value={item.overallStatus} /></td>
                  <td className="px-3 py-3 text-muted-foreground">{elapsedLabel(currentStageSince(item), now)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{elapsedBetween(item.createdAt, item.completedAt, now)}</td>
                  <td className="px-3 py-3">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    {readOnly || listView === "history" ? (
                      <span className="text-xs text-muted-foreground">View only</span>
                    ) : isEditing ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => saveEdit(item.id)}
                          className="h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={cancelEdit}
                          className="h-9 rounded-md border px-3 text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => startEdit(item)}
                          className="h-9 rounded-md border px-3 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => confirmDelete(item)}
                          className="h-9 rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
