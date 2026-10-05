"use client";

import { useState, useTransition, type ReactNode } from "react";

import {
  getOgfPriceTally,
  getPriceStatus,
  getStandardPriceTally,
  ITEM_CREATION_STATUS_LABELS,
  PRICE_STATUS_LABELS,
} from "@/lib/item-creation/helpers";

type ItemCreationItem = {
  id: string;
  sku: string;
  description: string;
  standardPrice: string | number;
  ogfPrice: string | number | null;
  country: string;
  creationSources: string[];
  overallStatus: string;
  seoSetupStatus: string;
  seoActivationStatus: string;
  digitalMarketingStatus: string;
  purchasingStatus: string;
  storeTransferStatus: string;
  storeStockStatus: string;
  imageDriveUrl: string | null;
  erpStandardPrice: string | number | null;
  erpOgfPrice: string | number | null;
  erp2ItemCreationStatus: string;
  erp2ItemCreationError: string | null;
  erp2ItemCode: string | null;
  createdAt: string;
};

type Props = {
  initialItems: ItemCreationItem[];
  initialFilters: Record<string, string>;
  permissions: {
    admin: boolean;
    seo: boolean;
    digitalMarketing: boolean;
    purchasing: boolean;
    stores: boolean;
  };
};

type TeamView = "admin" | "seo" | "digitalMarketing" | "purchasing" | "stores";
type WorkTeamView = Exclude<TeamView, "admin">;
type CreateRow = {
  key: number;
  sku: string;
  description: string;
  standardPrice: string;
  ogfPrice: string;
  country: string;
  creationSources: string[];
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
const money = (value: string | number | null) =>
  value === null ? "-" : Number(value).toFixed(2);

const inputClass =
  "h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary";
const primaryButtonClass =
  "h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "h-10 rounded-md border bg-background px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";

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

const emptyCreateRow = (key: number): CreateRow => ({
  key,
  sku: "",
  description: "",
  standardPrice: "",
  ogfPrice: "",
  country: "",
  creationSources: ["SHOPIFY"],
});

function defaultView(permissions: Props["permissions"]): TeamView {
  if (permissions.admin) return "admin";
  if (permissions.seo) return "seo";
  if (permissions.digitalMarketing) return "digitalMarketing";
  if (permissions.purchasing) return "purchasing";
  return "stores";
}

export function ItemCreationPanel({
  initialItems,
  initialFilters,
  permissions,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [activeView, setActiveView] = useState<TeamView>(defaultView(permissions));
  const [createRows, setCreateRows] = useState<CreateRow[]>([emptyCreateRow(1)]);
  const [isPending, startTransition] = useTransition();

  const canAct = (area: keyof Props["permissions"]) =>
    permissions.admin || permissions[area];

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
            ogfPrice: row.ogfPrice,
            country: row.country.trim(),
            creationSources: row.creationSources,
          }))
          .filter((row) => row.sku || row.description || row.standardPrice || row.country);
        await post("/api/item-creation", { items });
        setCreateRows([emptyCreateRow(Date.now())]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Create failed");
      }
    });
  }

  function updateCreateRow(key: number, field: keyof Omit<CreateRow, "key">, value: string) {
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

  function addCreateRow() {
    setCreateRows((rows) => [...rows, emptyCreateRow(Date.now())]);
  }

  function removeCreateRow(key: number) {
    setCreateRows((rows) =>
      rows.length === 1 ? [emptyCreateRow(Date.now())] : rows.filter((row) => row.key !== key)
    );
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
        <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/seo/image-updated`)}>
          Mark Image Updated
        </ActionButton>
      ),
    },
    {
      title: "Waiting Activation",
      subtitle: "Stock is added and SEO can activate the item.",
      team: "seo",
      visible: canAct("seo"),
      items: items.filter((item) => item.seoActivationStatus === "WAITING_ACTIVATION"),
      action: (item: ItemCreationItem) => (
        <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/seo/activate`)}>
          Activate Item
        </ActionButton>
      ),
    },
    {
      title: "Completed",
      subtitle: "SEO activation is done.",
      team: "seo",
      visible: canAct("seo"),
      items: items.filter((item) => item.seoActivationStatus === "ACTIVATED"),
      action: () => <StatusPill value="COMPLETED" />,
    },
    {
      title: "Pending",
      subtitle: "Add the Drive link and confirm image creation.",
      team: "digitalMarketing",
      visible: canAct("digitalMarketing"),
      items: items.filter((item) => item.digitalMarketingStatus === "PENDING"),
      action: (item: ItemCreationItem) => (
        <DigitalAction item={item} onAction={runAction} />
      ),
    },
    {
      title: "Completed",
      subtitle: "Drive links are ready for the next stages.",
      team: "digitalMarketing",
      visible: canAct("digitalMarketing"),
      items: items.filter((item) => item.digitalMarketingStatus === "IMAGE_CREATED"),
      action: () => <StatusPill value="COMPLETED" />,
    },
    {
      title: "Pending",
      subtitle: "ERP prices are being checked or manually confirmed.",
      team: "purchasing",
      visible: canAct("purchasing"),
      items: items.filter((item) => item.purchasingStatus === "WAITING_FOR_PRICES"),
      action: (item: ItemCreationItem) => (
        <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/pricing/update`)}>
          Update Prices
        </ActionButton>
      ),
    },
    {
      title: "Completed",
      subtitle: "Prices have been confirmed.",
      team: "purchasing",
      visible: canAct("purchasing"),
      items: items.filter((item) => item.purchasingStatus === "PRICE_UPDATED"),
      action: () => <StatusPill value="COMPLETED" />,
    },
    {
      title: "Transfer",
      subtitle: "Send and receive the physical transfer.",
      team: "stores",
      visible: canAct("stores"),
      items: items.filter((item) => item.storeTransferStatus !== "RECEIVED"),
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
      subtitle: "Add stock after purchasing has confirmed prices.",
      team: "stores",
      visible: canAct("stores"),
      items: items.filter((item) => item.storeStockStatus !== "STOCK_ADDED"),
      action: (item: ItemCreationItem) =>
        item.storeStockStatus === "READY_FOR_STOCK" ? (
          <ActionButton onClick={() => runAction(`/api/item-creation/${item.id}/stores/stock-added`)}>
            Mark Stock Added
          </ActionButton>
        ) : (
          <span className="text-sm text-muted-foreground">Waiting for price</span>
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
              Manage item setup, images, prices, transfers, stock, and final SEO activation.
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
          <MetricCard label="Completed" value={items.filter((item) => item.overallStatus === "COMPLETED").length} />
          <MetricCard label="Waiting Prices" value={items.filter((item) => item.purchasingStatus === "WAITING_FOR_PRICES").length} />
          <MetricCard label="Waiting Activation" value={items.filter((item) => item.seoActivationStatus === "WAITING_ACTIVATION").length} />
        </div>
      </div>

      {permissions.admin && (
        <div className="grid gap-2 rounded-lg border bg-card p-2 md:grid-cols-5">
          {viewTabs.map((tab) => (
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

      {permissions.admin && activeView === "admin" && (
        <div className="space-y-4">
          <form action={submitCreate} className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-normal">
                Create Item Request
              </h2>
              <button
                type="button"
                onClick={addCreateRow}
                className={secondaryButtonClass}
              >
                Add Item
              </button>
            </div>
            <div className="grid gap-3">
              {createRows.map((row, index) => (
                <div
                  key={row.key}
                  className="grid gap-3 rounded-md border bg-background p-3"
                >
                  <div className="grid gap-3 xl:grid-cols-[1fr_2fr_1fr_1fr_1fr_auto]">
                    <input
                      value={row.sku}
                      onChange={(event) => updateCreateRow(row.key, "sku", event.target.value)}
                      required
                      placeholder="SKU"
                      className={inputClass}
                    />
                    <input
                      value={row.description}
                      onChange={(event) => updateCreateRow(row.key, "description", event.target.value)}
                      required
                      placeholder="Description"
                      className={inputClass}
                    />
                    <input
                      value={row.standardPrice}
                      onChange={(event) => updateCreateRow(row.key, "standardPrice", event.target.value)}
                      required
                      type="number"
                      step="0.01"
                      placeholder="Standard Price"
                      className={inputClass}
                    />
                    <input
                      value={row.ogfPrice}
                      onChange={(event) => updateCreateRow(row.key, "ogfPrice", event.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="OGF Price"
                      className={inputClass}
                    />
                    <input
                      value={row.country}
                      onChange={(event) => updateCreateRow(row.key, "country", event.target.value)}
                      required
                      placeholder="Country"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => removeCreateRow(row.key)}
                      className={`${secondaryButtonClass} px-3`}
                      aria-label={`Remove item ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Sources to create
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { value: "SHOPIFY", label: "Shopify" },
                        { value: "ERP2", label: "ERP 02" },
                      ].map((source) => (
                        <label
                          key={source.value}
                          className={`flex h-8 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
                            row.creationSources.includes(source.value)
                              ? "border-primary bg-primary/10 text-foreground"
                              : "bg-background text-muted-foreground"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={row.creationSources.includes(source.value)}
                            onChange={() => toggleCreateSource(row.key, source.value)}
                            className="size-4"
                          />
                          {source.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
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
            <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
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

      {permissions.admin && activeView === "admin" && (
        <AdminTable
          items={items}
          isPending={isPending}
          onDelete={deleteRequest}
          onUpdate={updateRequest}
          onAction={runAction}
        />
      )}

      {activeView !== "admin" && (
        <TeamWorkflowView
          teamLabel={teamViewLabel(activeView)}
          sections={visibleSections}
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

function TeamWorkflowView({
  teamLabel,
  sections,
}: {
  teamLabel: string;
  sections: TeamSection[];
}) {
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const activeSections = sections.filter((section) => section.items.length > 0);

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
        <span className="w-fit rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
          {total} Active
        </span>
      </div>

      <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <div key={section.title} className="rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{section.title}</div>
              <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-semibold">
                {section.items.length}
              </span>
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
                  <span className="text-sm text-muted-foreground">
                    {section.items.length} request{section.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {section.items.map((item) => (
                    <RequestCard
                      key={`${section.title}-${item.id}`}
                      item={item}
                      action={section.action(item)}
                    />
                  ))}
                </div>
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
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={primaryButtonClass}>
      {children}
    </button>
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

function RequestCard({ item, action }: { item: ItemCreationItem; action: ReactNode }) {
  const priceStatus = getPriceStatus(item);
  return (
    <div className="rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoBlock label="Price Status" value={PRICE_STATUS_LABELS[priceStatus]} />
        <InfoBlock label="Stock Status" value={status(item.storeStockStatus)} />
        <InfoBlock label="Google Drive" value={<DriveLink url={item.imageDriveUrl} />} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <InfoBlock
          label="Standard Price"
          value={`${money(item.standardPrice)} / ERP ${money(item.erpStandardPrice)} (${getStandardPriceTally(item)})`}
        />
        <InfoBlock
          label="OGF Price"
          value={`${money(item.ogfPrice)} / ERP ${money(item.erpOgfPrice)} (${getOgfPriceTally(item)})`}
        />
      </div>
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
  onDelete,
  onUpdate,
  onAction,
}: {
  items: ItemCreationItem[];
  isPending: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, body: unknown) => void;
  onAction: (url: string, body?: unknown) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Omit<CreateRow, "key" | "creationSources">>({
    sku: "",
    description: "",
    standardPrice: "",
    ogfPrice: "",
    country: "",
  });

  function startEdit(item: ItemCreationItem) {
    setEditingId(item.id);
    setEditRow({
      sku: item.sku,
      description: item.description,
      standardPrice: String(item.standardPrice),
      ogfPrice: item.ogfPrice === null ? "" : String(item.ogfPrice),
      country: item.country,
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

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">All Requests</h2>
          <p className="text-sm text-muted-foreground">
            Full workflow status across every team.
          </p>
        </div>
        <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium">
          {items.length}
        </span>
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
            {items.map((item) => {
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
                        <input
                          value={editRow.ogfPrice}
                          onChange={(event) => setEditRow((row) => ({ ...row, ogfPrice: event.target.value }))}
                          type="number"
                          step="0.01"
                          placeholder="OGF Price"
                          className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill value={item.erp2ItemCreationStatus} />
                        {item.erp2ItemCreationStatus === "FAILED" && (
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
                  <td className="px-3 py-3"><StatusPill value={item.seoSetupStatus} /></td>
                  <td className="px-3 py-3"><StatusPill value={item.digitalMarketingStatus} /></td>
                  <td className="px-3 py-3"><StatusPill value={item.purchasingStatus} /></td>
                  <td className="px-3 py-3"><StatusPill value={item.storeTransferStatus} /></td>
                  <td className="px-3 py-3"><StatusPill value={item.storeStockStatus} /></td>
                  <td className="px-3 py-3"><StatusPill value={item.seoActivationStatus} /></td>
                  <td className="px-3 py-3"><StatusPill value={item.overallStatus} /></td>
                  <td className="px-3 py-3">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    {isEditing ? (
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
