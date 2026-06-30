"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import type {
  ContactAllocationContact,
  ContactAllocationFilters,
  ContactAllocationPageData,
} from "@/lib/page-data/contact-allocation";

const ALL_VALUE = "__all__";

type LookupContact = ContactAllocationContact & {
  status?: "active" | "inactive" | "never_purchased";
};

type BulkFilters = Required<Record<keyof ContactAllocationFilters, string>>;

const initialBulkFilters: BulkFilters = {
  serviceProvider: "",
  source: "",
  country: "",
  district: "",
  town: "",
  zone: "",
  gender: "",
  origin: "",
  category: "",
  exWebCus: "",
  exOffCus: "",
  recentMerchant: "",
  area: "",
  updatedMonth: "",
  lastPurchaseMonth: "",
  customerType: "",
  whatsappAllowed: "",
  allocatedTo: "",
};

function display(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

function booleanLabel(value: boolean | null | undefined) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "-";
}

function formatMonth(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-LK", { year: "numeric", month: "2-digit" });
}

function parseTpNumbers(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function toQuery(filters: BulkFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim());
  }
  return params.toString();
}

function optionValue(value: string) {
  return value.trim() ? value : ALL_VALUE;
}

function fromOptionValue(value: string) {
  return value === ALL_VALUE ? "" : value;
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "-",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase text-foreground">
        {label}
      </label>
      <Select
        value={optionValue(value)}
        onValueChange={(next) => onChange(fromOptionValue(next))}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 rounded-none">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase text-foreground">
        {label}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 rounded-none"
      />
    </div>
  );
}

export function ContactAllocationPanel({
  initialData,
  canManage,
}: {
  initialData: ContactAllocationPageData;
  canManage: boolean;
}) {
  const [allocationData, setAllocationData] = useState(initialData);
  const [tpNo, setTpNo] = useState("");
  const [individualAssignee, setIndividualAssignee] = useState("");
  const [lookupContact, setLookupContact] = useState<LookupContact | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [individualSaving, setIndividualSaving] = useState(false);
  const [multipleTpNumbers, setMultipleTpNumbers] = useState("");
  const [multipleAssignee, setMultipleAssignee] = useState("");
  const [multipleSaving, setMultipleSaving] = useState(false);
  const [bulkFilters, setBulkFilters] = useState<BulkFilters>(initialBulkFilters);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const assigneeLabels = useMemo(
    () => allocationData.options.assignees.map((assignee) => assignee.label),
    [allocationData.options.assignees]
  );

  function updateBulkFilter<K extends keyof BulkFilters>(key: K, value: BulkFilters[K]) {
    setBulkFilters((current) => ({ ...current, [key]: value }));
  }

  async function refreshBulkPreview(nextFilters = bulkFilters) {
    setBulkLoading(true);
    try {
      const query = toQuery(nextFilters);
      const response = await fetch(`/api/admin/contacts/allocation${query ? `?${query}` : ""}`);
      const data = (await response.json()) as ContactAllocationPageData & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load allocation preview");
      }
      setAllocationData(data);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load allocation preview");
    } finally {
      setBulkLoading(false);
    }
  }

  async function lookupByTpNo() {
    const phone = tpNo.trim();
    if (!phone) {
      notify.error("Enter a TP number");
      return;
    }

    setLookupLoading(true);
    setLookupContact(null);
    try {
      const response = await fetch(
        `/api/admin/contacts/allocation/lookup?phone=${encodeURIComponent(phone)}`
      );
      const data = (await response.json()) as {
        found?: boolean;
        contact?: LookupContact;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to find contact");
      }
      if (!data.found || !data.contact) {
        notify.error("No contact found for that TP number");
        return;
      }
      setLookupContact(data.contact);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to find contact");
    } finally {
      setLookupLoading(false);
    }
  }

  async function allocate(payload: unknown, mode: "individual" | "multiple" | "bulk") {
    const response = await fetch("/api/admin/contacts/allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { count?: number; error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "Allocation failed");
    }
      notify.success(`${data.count ?? 0} contact${data.count === 1 ? "" : "s"} allocated`);
    if (mode !== "individual") {
      await refreshBulkPreview();
    } else {
      setLookupContact((current) =>
        current ? { ...current, assignedMerchant: individualAssignee } : current
      );
    }
  }

  async function allocateIndividual() {
    if (!tpNo.trim()) {
      notify.error("Enter a TP number");
      return;
    }
    if (!individualAssignee) {
      notify.error("Select who to allocate to");
      return;
    }
    setIndividualSaving(true);
    try {
      await allocate(
        { mode: "individual", phoneNumber: tpNo.trim(), allocatedTo: individualAssignee },
        "individual"
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Allocation failed");
    } finally {
      setIndividualSaving(false);
    }
  }

  async function allocateMultiple() {
    const phoneNumbers = parseTpNumbers(multipleTpNumbers);
    if (phoneNumbers.length === 0) {
      notify.error("Enter at least one TP number");
      return;
    }
    if (!multipleAssignee) {
      notify.error("Select who to allocate to");
      return;
    }
    setMultipleSaving(true);
    try {
      await allocate(
        { mode: "multiple", phoneNumbers, allocatedTo: multipleAssignee },
        "multiple"
      );
      setMultipleTpNumbers("");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Allocation failed");
    } finally {
      setMultipleSaving(false);
    }
  }

  async function allocateBulk() {
    if (!bulkAssignee) {
      notify.error("Select who to allocate to");
      return;
    }
    setBulkSaving(true);
    try {
      await allocate(
        { mode: "bulk", filters: bulkFilters, allocatedTo: bulkAssignee },
        "bulk"
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Allocation failed");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="space-y-4 text-xs">
      <Card className="gap-0 rounded-none border-t-2 border-t-sky-600 py-0">
        <CardHeader className="border-b px-4 py-2">
          <CardTitle className="text-sm font-medium uppercase">Individual Allocation.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 px-4 py-4">
          <div className="grid gap-5 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase">TP No</label>
              <div className="flex gap-2">
                <Input
                  value={tpNo}
                  onChange={(event) => setTpNo(event.target.value)}
                  className="h-9 rounded-none"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={lookupByTpNo}
                  disabled={lookupLoading}
                  className="h-9 w-9 rounded-none"
                >
                  {lookupLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                </Button>
              </div>
            </div>
            <SelectField
              label="Allocate To"
              value={individualAssignee}
              onChange={setIndividualAssignee}
              options={assigneeLabels}
              placeholder="Select assignee"
            />
          </div>

          <div className="grid gap-x-10 gap-y-4 lg:grid-cols-4">
            <div className="font-semibold">S. Provider :- <span className="font-normal">{display(lookupContact?.serviceProvider)}</span></div>
            <div className="font-semibold">Source :- <span className="font-normal">{display(lookupContact?.source)}</span></div>
            <div className="font-semibold">Country :- <span className="font-normal">{display(lookupContact?.country)}</span></div>
            <div className="font-semibold">District :- <span className="font-normal">{display(lookupContact?.district)}</span></div>
            <div className="font-semibold">Town :- <span className="font-normal">{display(lookupContact?.town)}</span></div>
            <div className="font-semibold">Gender :- <span className="font-normal">{display(lookupContact?.gender)}</span></div>
            <div className="font-semibold">Origin :- <span className="font-normal">{display(lookupContact?.origin)}</span></div>
            <div className="font-semibold">Category :- <span className="font-normal">{display(lookupContact?.category)}</span></div>
            <div className="font-semibold">Ex Web Cus. :- <span className="font-normal">{booleanLabel(lookupContact?.exWebCustomer)}</span></div>
            <div className="font-semibold">Ex Off Cus. :- <span className="font-normal">{booleanLabel(lookupContact?.exOffCustomer)}</span></div>
            <div className="font-semibold">Recent Merchent :- <span className="font-normal">{display(lookupContact?.recentMerchant)}</span></div>
            <div className="font-semibold">Allocated To :- <span className="font-normal">{display(lookupContact?.assignedMerchant)}</span></div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={allocateIndividual}
              disabled={!canManage || individualSaving}
              className="h-9 min-w-36 rounded-none bg-emerald-600 hover:bg-emerald-700"
            >
              {individualSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Allocate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-none border-t-2 border-t-sky-600 py-0">
        <CardHeader className="border-b px-4 py-2">
          <CardTitle className="text-sm font-medium uppercase">Multiple Allocation</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)_140px]">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase">
                TP Numbers (Comma Separated)
              </label>
              <Textarea
                value={multipleTpNumbers}
                onChange={(event) => setMultipleTpNumbers(event.target.value)}
                placeholder="Enter multiple contact numbers separated by commas (e.g., 0771234567, 0777654321, 0712345678)"
                className="min-h-16 rounded-none"
              />
            </div>
            <SelectField
              label="Allocate To"
              value={multipleAssignee}
              onChange={setMultipleAssignee}
              options={assigneeLabels}
              placeholder="Select assignee"
            />
            <div className="flex items-end">
              <Button
                type="button"
                onClick={allocateMultiple}
                disabled={!canManage || multipleSaving}
                className="h-9 w-full rounded-none bg-emerald-600 hover:bg-emerald-700"
              >
                {multipleSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Allocate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-none border-t-2 border-t-sky-600 py-0">
        <CardHeader className="border-b px-4 py-2">
          <CardTitle className="text-sm font-medium uppercase">Bulk Allocation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-4">
            <SelectField label="S. Provider" value={bulkFilters.serviceProvider} onChange={(value) => updateBulkFilter("serviceProvider", value)} options={allocationData.options.serviceProviders} />
            <TextField label="Source" value={bulkFilters.source} onChange={(value) => updateBulkFilter("source", value)} />
            <TextField label="Country" value={bulkFilters.country} onChange={(value) => updateBulkFilter("country", value)} />
            <SelectField label="District" value={bulkFilters.district} onChange={(value) => updateBulkFilter("district", value)} options={allocationData.options.districts} />
            <SelectField label="Town" value={bulkFilters.town} onChange={(value) => updateBulkFilter("town", value)} options={allocationData.options.towns} />
            <TextField label="Zone" value={bulkFilters.zone} onChange={(value) => updateBulkFilter("zone", value)} />
            <SelectField label="Gender" value={bulkFilters.gender} onChange={(value) => updateBulkFilter("gender", value)} options={allocationData.options.genders} />
            <SelectField label="Origin" value={bulkFilters.origin} onChange={(value) => updateBulkFilter("origin", value)} options={allocationData.options.origins} />
            <SelectField label="Category" value={bulkFilters.category} onChange={(value) => updateBulkFilter("category", value)} options={allocationData.options.categories} />
            <SelectField label="Ex Web Cus" value={bulkFilters.exWebCus} onChange={(value) => updateBulkFilter("exWebCus", value)} options={["YES", "NO"]} placeholder="Select an Option" />
            <SelectField label="Ex Off Cus" value={bulkFilters.exOffCus} onChange={(value) => updateBulkFilter("exOffCus", value)} options={["YES", "NO"]} placeholder="Select an Option" />
            <SelectField label="Recent Merchent" value={bulkFilters.recentMerchant} onChange={(value) => updateBulkFilter("recentMerchant", value)} options={allocationData.options.recentMerchants} />
            <TextField label="Area" value={bulkFilters.area} onChange={(value) => updateBulkFilter("area", value)} />
            <TextField label="Updated Month" type="month" value={bulkFilters.updatedMonth} onChange={(value) => updateBulkFilter("updatedMonth", value)} />
            <TextField label="Last P.Month" type="month" value={bulkFilters.lastPurchaseMonth} onChange={(value) => updateBulkFilter("lastPurchaseMonth", value)} />
            <SelectField label="Cus. Type" value={bulkFilters.customerType} onChange={(value) => updateBulkFilter("customerType", value)} options={allocationData.options.customerTypes} />
            <SelectField label="Allowed for Whatsapp Msg" value={bulkFilters.whatsappAllowed} onChange={(value) => updateBulkFilter("whatsappAllowed", value)} options={["YES", "NO"]} />
            <SelectField label="Allocated To" value={bulkFilters.allocatedTo} onChange={(value) => updateBulkFilter("allocatedTo", value)} options={allocationData.options.assignedMerchants} />
          </div>

          <Button
            type="button"
            size="icon"
            onClick={() => refreshBulkPreview()}
            disabled={bulkLoading}
            className="h-8 w-8 rounded-none bg-sky-500 hover:bg-sky-600"
          >
            {bulkLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>

          <div className="grid max-w-md gap-3">
            <SelectField
              label="Allocate To"
              value={bulkAssignee}
              onChange={setBulkAssignee}
              options={assigneeLabels}
              placeholder="Select assignee"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-[11px]">
              <thead>
                <tr className="border border-border">
                  {[
                    "S.Provider",
                    "Source",
                    "Country",
                    "District",
                    "Town",
                    "Zone",
                    "Gender",
                    "Origin",
                    "Category",
                    "Allocated To",
                    "Web Cus",
                    "Off Cus",
                    "R Mer.",
                    "Area",
                    "Up Month",
                    "Count",
                  ].map((heading) => (
                    <th key={heading} className="border border-border px-2 py-2 text-center font-semibold uppercase">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocationData.contacts.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="border border-border px-3 py-5 text-center text-muted-foreground">
                      No contacts match the selected filters.
                    </td>
                  </tr>
                ) : (
                  allocationData.contacts.slice(0, 25).map((contact) => (
                    <tr key={contact.id}>
                      <td className="border border-border px-2 py-2">{display(contact.serviceProvider)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.source)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.country)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.district)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.town)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.zone)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.gender)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.origin)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.category)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.assignedMerchant)}</td>
                      <td className="border border-border px-2 py-2 text-center">{booleanLabel(contact.exWebCustomer)}</td>
                      <td className="border border-border px-2 py-2 text-center">{booleanLabel(contact.exOffCustomer)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.recentMerchant)}</td>
                      <td className="border border-border px-2 py-2">{display(contact.area)}</td>
                      <td className="border border-border px-2 py-2">{formatMonth(contact.updatedAt)}</td>
                      <td className="border border-border px-2 py-2 text-right">{allocationData.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground">
              Showing {Math.min(allocationData.contacts.length, 25)} of {allocationData.total} matching contacts.
            </p>
            <Button
              type="button"
              onClick={allocateBulk}
              disabled={!canManage || bulkSaving}
              className="h-9 min-w-36 rounded-none bg-emerald-600 hover:bg-emerald-700"
            >
              {bulkSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Allocate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
