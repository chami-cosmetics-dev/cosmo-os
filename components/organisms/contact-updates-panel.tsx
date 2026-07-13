"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { formatAppDate } from "@/lib/format-datetime";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";

type ContactItem = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  status: "active" | "inactive" | "never_purchased";
  lastPurchaseAt: string | null;
  recentMerchant: string | null;
  updatedAt: string;
  createdAt: string;
  // Profile fields (populated from DB when available)
  remarks?: string | null;
  gender?: string | null;
  workPlace?: string | null;
  occupation?: string | null;
  address?: string | null;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  serviceProvider?: string | null;
  district?: string | null;
  town?: string | null;
  origin?: string | null;
  customerType?: string | null;
  category?: string | null;
  contactSaved?: boolean | null;
  whatsappAllowed?: boolean | null;
  remindAt?: string | null;
  remindTime?: string | null;
  mainProfileNo?: string | null;
};

type ContactPurchaseOrder = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  totalPrice: string;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  createdAt: string;
};

type ContactUpdatesPanelInitialData = {
  contacts: ContactItem[];
  total: number;
  page: number;
  limit: number;
  counts: {
    all: number;
    active: number;
    inactive: number;
    neverPurchased: number;
  };
};

type ContactFollowUpItem = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  lastPurchaseAt: string | null;
  recentMerchant: string | null;
  lastContactedAt: string | null;
  updatedAt: string | null;
};

type DetailForm = {
  remarks: string;
  serviceProvider: string;
  district: string;
  town: string;
  origin: string;
  customerType: string;
  gender: string;
  name: string;
  workPlace: string;
  occupation: string;
  address: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  email: string;
  category: string;
  contactSaved: string;
  whatsappAllowed: string;
  mainProfileNo: string;
  remindDate: string;
  remindTime: string;
};

function formatDateTime(value?: string | null) {
  return formatAppDate(value, "N/A");
}

function formatAmount(value: string, currency?: string | null) {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  const formatted = amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function phoneDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function phoneMatchesQuery(phoneNumber: string | null, query: string) {
  const normalizedQuery = query.trim();
  if (!phoneNumber || !normalizedQuery) return false;

  const queryDigits = phoneDigits(normalizedQuery);
  const phoneVariantSet = new Set(buildPhoneLookupVariants(phoneNumber));
  if (phoneVariantSet.has(normalizedQuery)) return true;
  if (queryDigits && phoneVariantSet.has(queryDigits)) return true;

  if ([3, 4, 6].includes(queryDigits.length)) {
    return [...phoneVariantSet].some((variant) => phoneDigits(variant).endsWith(queryDigits));
  }

  return false;
}

function buildInitialForm(contact: ContactItem | null): DetailForm {
  // Convert a stored remindAt ISO string to a date input value (YYYY-MM-DD)
  let remindDate = "";
  if (contact?.remindAt) {
    const d = new Date(contact.remindAt);
    if (!Number.isNaN(d.getTime())) {
      remindDate = d.toISOString().slice(0, 10);
    }
  }
  return {
    remarks: contact?.remarks ?? "-",
    serviceProvider: contact?.serviceProvider ?? "N/A",
    district: contact?.district ?? "N/A",
    town: contact?.town ?? "N/A",
    origin: contact?.origin ?? "N/A",
    customerType: contact?.customerType ?? "N/A",
    gender: contact?.gender ?? "N/A",
    name: contact?.name ?? "",
    workPlace: contact?.workPlace ?? "-",
    occupation: contact?.occupation ?? "-",
    address: contact?.address ?? "-",
    birthYear: contact?.birthYear != null ? String(contact.birthYear) : "0",
    birthMonth: contact?.birthMonth != null ? String(contact.birthMonth) : "0",
    birthDay: contact?.birthDay != null ? String(contact.birthDay) : "0",
    email: contact?.email ?? "",
    category: contact?.category ?? "N/A",
    contactSaved: contact?.contactSaved === true ? "YES" : "NO",
    whatsappAllowed: contact?.whatsappAllowed !== false ? "YES" : "NO",
    mainProfileNo: contact?.phoneNumber ?? "",
    remindDate,
    remindTime: contact?.remindTime ?? "03:30 PM",
  };
}

export function ContactUpdatesPanel({
  initialData,
  initialFollowUps = [],
  initialNotUpdatedQueue = [],
  canManage,
}: {
  initialData: ContactUpdatesPanelInitialData;
  initialFollowUps?: ContactFollowUpItem[];
  initialNotUpdatedQueue?: ContactFollowUpItem[];
  canManage: boolean;
}) {
  const contactsForDisplay = initialData.contacts;

  const [phoneSearch, setPhoneSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [lookedUpContact, setLookedUpContact] = useState<ContactItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [segmentOptions, setSegmentOptions] = useState<Record<"serviceProvider" | "district" | "town" | "origin" | "customerType" | "category", string[]>>({
    serviceProvider: [],
    district: [],
    town: [],
    origin: [],
    customerType: [],
    category: [],
  });

  useEffect(() => {
    fetch("/api/admin/contacts/contact-updates/options")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as typeof segmentOptions;
        setSegmentOptions(data);
      })
      .catch(() => {
        // silently ignore; fallback to empty options
      });
  }, []);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<ContactPurchaseOrder[]>([]);
  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [notUpdatedQueue, setNotUpdatedQueue] = useState(initialNotUpdatedQueue);
  const [queueTab, setQueueTab] = useState<"purchase" | "contacted">("purchase");
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [markingContactId, setMarkingContactId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DetailForm>(() =>
    buildInitialForm(contactsForDisplay[0] ?? null)
  );

  const selectedContact = useMemo(() => {
    if (lookedUpContact) return lookedUpContact;
    if (selectedContactId) {
      return (
        contactsForDisplay.find((contact) => contact.id === selectedContactId) ??
        null
      );
    }
    return null;
  }, [lookedUpContact, contactsForDisplay, selectedContactId]);

  useEffect(() => {
    setForm(buildInitialForm(selectedContact));
  }, [selectedContact]);

  useEffect(() => {
    if (!selectedContact) {
      setOrders([]);
      return;
    }

    let cancelled = false;
    setOrdersLoading(true);

    fetch(`/api/admin/contacts/${selectedContact.id}/orders`)
      .then(async (res) => {
        const data = (await res.json()) as {
          error?: string;
          orders?: ContactPurchaseOrder[];
        };

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to fetch purchases");
        }

        if (!cancelled) {
          setOrders(data.orders ?? []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setOrders([]);
          notify.error(
            error instanceof Error ? error.message : "Failed to fetch purchases"
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOrdersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedContact]);

  const totalPurchased = orders.reduce((sum, order) => {
    const amount = Number.parseFloat(order.totalPrice);
    return Number.isNaN(amount) ? sum : sum + amount;
  }, 0);

  async function handlePhoneSearch() {
    const normalizedQuery = phoneSearch.trim();
    if (!normalizedQuery) {
      notify.error("Enter a phone number to search");
      return;
    }

    setSearching(true);
    setLookedUpContact(null);
    try {
      const res = await fetch(
        `/api/admin/contacts/contact-updates/lookup?phone=${encodeURIComponent(normalizedQuery)}`
      );
      const data = (await res.json()) as {
        found: boolean;
        contact?: ContactItem;
        error?: string;
      };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to search for customer");
        return;
      }

      if (!data.found || !data.contact) {
        notify.error("No customer found for that phone number");
        return;
      }

      setLookedUpContact(data.contact);
      notify.success(`Loaded ${data.contact.name}`);
    } catch {
      notify.error("Failed to search for customer");
    } finally {
      setSearching(false);
    }
  }

  async function handleUpdate() {
    if (!selectedContact) return;
    setSaving(true);
    try {
      const remindAt = form.remindDate ? new Date(form.remindDate).toISOString() : null;
      const res = await fetch(`/api/admin/contacts/${selectedContact.id}/contact-updates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || undefined,
          email: form.email || null,
          remarks: form.remarks,
          gender: form.gender,
          workPlace: form.workPlace,
          occupation: form.occupation,
          address: form.address,
          birthYear: form.birthYear && form.birthYear !== "0" ? Number(form.birthYear) : null,
          birthMonth: form.birthMonth && form.birthMonth !== "0" ? Number(form.birthMonth) : null,
          birthDay: form.birthDay && form.birthDay !== "0" ? Number(form.birthDay) : null,
          mainProfileNo: form.mainProfileNo || null,
          serviceProvider: form.serviceProvider,
          district: form.district,
          town: form.town,
          origin: form.origin,
          customerType: form.customerType,
          category: form.category,
          contactSaved: form.contactSaved === "YES",
          whatsappAllowed: form.whatsappAllowed === "YES",
          remindAt,
          remindTime: form.remindTime || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to update contact");
        return;
      }
      notify.success(`Contact updated for ${selectedContact.name}`);
    } catch {
      notify.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  }

  async function markContacted(contact: ContactFollowUpItem) {
    try {
      setMarkingContactId(contact.id);
      const response = await fetch(`/api/admin/contacts/${contact.id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Marked contacted from contact updates queue" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to mark contacted");
      }
      setFollowUps((current) => current.filter((item) => item.id !== contact.id));
      setNotUpdatedQueue((current) => current.filter((item) => item.id !== contact.id));
      notify.success(`${contact.name} marked as contacted.`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to mark contacted");
    } finally {
      setMarkingContactId(null);
    }
  }

  function updateForm<K extends keyof DetailForm>(key: K, value: DetailForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className={showFollowUps ? "border-b" : ""}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Merchant Follow-up Queue</CardTitle>
              <CardDescription>
                {queueTab === "purchase"
                  ? "Contacts with no purchase in the last 60 days."
                  : "Contacts not updated in the last 60 days."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => setQueueTab("purchase")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    queueTab === "purchase"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Purchase ({followUps.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueTab("contacted")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    queueTab === "contacted"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Contacted ({notUpdatedQueue.length})
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFollowUps((current) => !current)}
                className="w-full lg:w-auto"
              >
                <Users className="mr-2 size-4" />
                {showFollowUps ? "Hide list" : "Show list"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showFollowUps && (
          <CardContent className="p-0">
            {queueTab === "purchase" && (
              <>
                {followUps.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">
                    No stale contacts are waiting for follow-up.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="border-b bg-muted/35 text-left text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Contact</th>
                          <th className="px-4 py-3 font-medium">Phone</th>
                          <th className="px-4 py-3 font-medium">Last Purchase</th>
                          <th className="px-4 py-3 font-medium">Merchant</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {followUps.map((contact) => (
                          <tr key={contact.id} className="border-b last:border-0">
                            <td className="px-4 py-3">
                              <div className="font-medium">{contact.name}</div>
                              <div className="text-xs text-muted-foreground">{contact.email ?? "No email"}</div>
                            </td>
                            <td className="px-4 py-3">{contact.phoneNumber ?? "N/A"}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDateTime(contact.lastPurchaseAt)}
                            </td>
                            <td className="px-4 py-3">{contact.recentMerchant ?? "N/A"}</td>
                            <td className="px-4 py-3">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => markContacted(contact)}
                                disabled={markingContactId === contact.id}
                              >
                                {markingContactId === contact.id ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-2 size-4" />
                                )}
                                Mark Contacted
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {queueTab === "contacted" && (
              <>
                {notUpdatedQueue.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">
                    All contacts have been updated within the last 60 days.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="border-b bg-muted/35 text-left text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Contact</th>
                          <th className="px-4 py-3 font-medium">Phone</th>
                          <th className="px-4 py-3 font-medium">Last Updated</th>
                          <th className="px-4 py-3 font-medium">Merchant</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notUpdatedQueue.map((contact) => (
                          <tr key={contact.id} className="border-b last:border-0">
                            <td className="px-4 py-3">
                              <div className="font-medium">{contact.name}</div>
                              <div className="text-xs text-muted-foreground">{contact.email ?? "No email"}</div>
                            </td>
                            <td className="px-4 py-3">{contact.phoneNumber ?? "N/A"}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDateTime(contact.updatedAt)}
                            </td>
                            <td className="px-4 py-3">{contact.recentMerchant ?? "N/A"}</td>
                            <td className="px-4 py-3">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => markContacted(contact)}
                                disabled={markingContactId === contact.id}
                              >
                                {markingContactId === contact.id ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-2 size-4" />
                                )}
                                Mark Contacted
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Contact Updates</CardTitle>
          <CardDescription>
            Search by phone number, review purchase history, and update contact
            details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-3 border-b pb-6 lg:flex-row lg:items-center lg:justify-end">
            <div className="flex w-full max-w-md gap-0">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={phoneSearch}
                  onChange={(event) => setPhoneSearch(event.target.value)}
                  placeholder="Search by phone number"
                  className="rounded-r-none pl-9"
                />
              </div>
              <Button
                type="button"
                onClick={handlePhoneSearch}
                className="rounded-l-none"
                disabled={searching}
              >
                {searching ? <Loader2 className="size-4 animate-spin" /> : "Check"}
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_300px]">
              <div className="space-y-2">
                <div className="space-y-1 text-sm">
                  <p className="text-sm font-medium text-muted-foreground">
                    Merchant
                  </p>
                  <Input value={selectedContact?.recentMerchant ?? "N/A"} readOnly />
                </div>
              </div>

              <div className="space-y-2">
                <div className="space-y-1 text-sm">
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Purchased
                  </p>
                  <Input value={formatAmount(String(totalPurchased), "LKR")} readOnly />
                </div>
              </div>

              <div className="space-y-2">
                <div className="space-y-1 text-sm">
                  <p className="text-sm font-medium text-muted-foreground">
                    Email Status
                  </p>
                  <Input
                    value={
                      selectedContact?.email
                        ? "Email Linked"
                        : "The Email Does not Exist"
                    }
                    readOnly
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Profile Picture
                </p>
                <div className="flex min-h-[220px] items-start justify-center rounded-md border bg-muted/20 p-4">
                  <div className="flex h-40 w-full items-center justify-center rounded-md border bg-background text-sm text-muted-foreground">
                    No image
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Last Purchases</h3>

              {ordersLoading ? (
                <div className="flex items-center justify-center rounded-md border py-16">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-md border border-dashed py-12 text-center">
                  <p className="text-sm font-medium">No purchases found</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    This customer does not have matching orders yet.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-3 text-left font-semibold">
                          Store
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Code
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Invoice No
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Days
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Invoice Date
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Methode of Use
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b last:border-0">
                          <td className="px-4 py-3">Online</td>
                          <td className="px-4 py-3">
                            {order.orderNumber ?? order.shopifyOrderId}
                          </td>
                          <td className="px-4 py-3">
                            {order.name ?? "Order Purchase"}
                          </td>
                          <td className="px-4 py-3">-</td>
                          <td className="px-4 py-3">
                            {formatDateTime(order.createdAt)}
                          </td>
                          <td className="px-4 py-3">No Detail</td>
                          <td className="px-4 py-3">
                            {formatAmount(order.totalPrice, order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Customer Details</CardTitle>
              <CardDescription>
                Update CRM notes, customer profile details, and follow-up
                scheduling in one place.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border bg-muted/30 px-2 py-1">
                {selectedContact?.phoneNumber ?? "No phone"}
              </span>
              <span className="rounded-md border bg-muted/30 px-2 py-1">
                {canManage ? "Editable" : "Read only"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="rounded-xl border bg-muted/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Remarks</p>
                <p className="text-muted-foreground text-sm">
                  Add important context, reminders, and team notes for this
                  contact.
                </p>
              </div>
            </div>
            <Textarea
              value={form.remarks}
              onChange={(event) => updateForm("remarks", event.target.value)}
              disabled={!canManage}
              className="min-h-24 bg-background"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <div className="rounded-xl border p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700">
                    <Clock3 className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium">Customer Profile</p>
                    <p className="text-muted-foreground text-sm">
                      Identity and personal fields used by the team during
                      customer follow-up.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-12">
                  <div className="space-y-2 xl:col-span-2">
                    <label className="text-sm font-medium">Gender</label>
                    <Select
                      value={form.gender}
                      onValueChange={(value) => updateForm("gender", value)}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value)}
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-3">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      value={form.email}
                      onChange={(event) => updateForm("email", event.target.value)}
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-3">
                    <label className="text-sm font-medium">
                      Main Profile No
                    </label>
                    <Input
                      value={form.mainProfileNo}
                      onChange={(event) =>
                        updateForm("mainProfileNo", event.target.value)
                      }
                      disabled={!canManage}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-12">
                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Work Place</label>
                    <Input
                      value={form.workPlace}
                      onChange={(event) =>
                        updateForm("workPlace", event.target.value)
                      }
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Occupation</label>
                    <Input
                      value={form.occupation}
                      onChange={(event) =>
                        updateForm("occupation", event.target.value)
                      }
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">
                      Date of Birth (YYYY / MM / DD)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        value={form.birthYear}
                        onChange={(event) =>
                          updateForm("birthYear", event.target.value)
                        }
                        disabled={!canManage}
                      />
                      <Input
                        value={form.birthMonth}
                        onChange={(event) =>
                          updateForm("birthMonth", event.target.value)
                        }
                        disabled={!canManage}
                      />
                      <Input
                        value={form.birthDay}
                        onChange={(event) =>
                          updateForm("birthDay", event.target.value)
                        }
                        disabled={!canManage}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <label className="text-sm font-medium">Address</label>
                  <Input
                    value={form.address}
                    onChange={(event) => updateForm("address", event.target.value)}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="rounded-xl border p-5">
                <div className="mb-4">
                  <p className="font-medium">Segmentation</p>
                  <p className="text-muted-foreground text-sm">
                    CRM grouping and audience fields used for categorization and
                    targeting.
                  </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-12">
                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">
                      Service Provider
                    </label>
                    <Select
                      value={form.serviceProvider}
                      onValueChange={(value) =>
                        updateForm("serviceProvider", value)
                      }
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        {segmentOptions.serviceProvider.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">District</label>
                    <Select
                      value={form.district}
                      onValueChange={(value) => updateForm("district", value)}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        {segmentOptions.district.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Town</label>
                    <Select
                      value={form.town}
                      onValueChange={(value) => updateForm("town", value)}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        {segmentOptions.town.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Origin</label>
                    <Select
                      value={form.origin}
                      onValueChange={(value) => updateForm("origin", value)}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        {segmentOptions.origin.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">
                      Customer Type
                    </label>
                    <Select
                      value={form.customerType}
                      onValueChange={(value) =>
                        updateForm("customerType", value)
                      }
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        {segmentOptions.customerType.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Category</label>
                    <Select
                      value={form.category}
                      onValueChange={(value) => updateForm("category", value)}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        {segmentOptions.category.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border p-5">
                <p className="font-medium">Contact Preferences</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Quick CRM flags and profile identifiers.
                </p>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">C.N Saved</label>
                    <Select
                      value={form.contactSaved}
                      onValueChange={(value) =>
                        updateForm("contactSaved", value)
                      }
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NO">NO</SelectItem>
                        <SelectItem value="YES">YES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Allowed for WhatsApp Msg
                    </label>
                    <Select
                      value={form.whatsappAllowed}
                      onValueChange={(value) =>
                        updateForm("whatsappAllowed", value)
                      }
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YES">YES</SelectItem>
                        <SelectItem value="NO">NO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Main Profile No
                    </label>
                    <Input
                      value={form.mainProfileNo}
                      onChange={(event) =>
                        updateForm("mainProfileNo", event.target.value)
                      }
                      disabled={!canManage}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-5">
                <p className="font-medium">Reminder Settings</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Schedule the next outreach without leaving this screen.
                </p>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-cyan-700">
                      Remind Date
                    </label>
                    <Input
                      type="date"
                      value={form.remindDate}
                      onChange={(event) =>
                        updateForm("remindDate", event.target.value)
                      }
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Remind Time</label>
                    <div className="flex">
                      <Input
                        value={form.remindTime}
                        onChange={(event) =>
                          updateForm("remindTime", event.target.value)
                        }
                        disabled={!canManage}
                        className="rounded-r-none"
                      />
                      <div className="flex h-9 w-14 items-center justify-center rounded-r-md border border-l-0 bg-muted/20">
                        <Clock3 className="size-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-cyan-500/8 px-3 py-2 text-sm">
                    <p className="font-medium text-cyan-800">Last Reminder</p>
                    <p className="mt-1 text-cyan-700">-</p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleUpdate}
                disabled={!selectedContact || !canManage || saving}
                className="h-11 w-full bg-green-600 hover:bg-green-700"
              >
                {saving ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</>
                ) : (
                  "Update Contact"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
