"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Loader2, Phone, Search } from "lucide-react";

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

type ContactAllocationPanelInitialData = {
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

const MOCK_CONTACT: ContactItem = {
  id: "mock-contact-allocation",
  name: "Tharanga Dissanayake",
  email: "tharangauae@gmail.com",
  phoneNumber: "0717164237",
  status: "active",
  lastPurchaseAt: "2026-02-27T10:30:00.000Z",
  recentMerchant: "Pepiliyana Outlet",
  updatedAt: "2026-03-02T09:00:00.000Z",
  createdAt: "2025-11-12T08:00:00.000Z",
};

const MOCK_ORDERS: ContactPurchaseOrder[] = [
  {
    id: "mock-order-1",
    shopifyOrderId: "MIE02-1",
    orderNumber: "MIE02-1",
    name: "Mielle Rosemary Mint Scalp and Hair Strengthening Oil 59ml #1 - MIE02-1",
    totalPrice: "1790.00",
    currency: "LKR",
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    createdAt: "2026-01-16T08:30:00.000Z",
  },
  {
    id: "mock-order-2",
    shopifyOrderId: "LAR07-1",
    orderNumber: "LAR07-1",
    name: "La Roche-Posay Anthelios Ultra Fluid SPF50+ Facial Sunscreen 50ml #1 - LAR07-1",
    totalPrice: "2200.00",
    currency: "LKR",
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    createdAt: "2026-02-27T09:10:00.000Z",
  },
  {
    id: "mock-order-3",
    shopifyOrderId: "LAR11-1",
    orderNumber: "LAR11-1",
    name: "La Roche-Posay Dry Touch Gel Cream SPF 60 50ml #1 - LAR11-1",
    totalPrice: "1650.00",
    currency: "LKR",
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    createdAt: "2026-01-08T11:45:00.000Z",
  },
  {
    id: "mock-order-4",
    shopifyOrderId: "ORD60-1",
    orderNumber: "ORD60-1",
    name: "The Ordinary Squalane + Amino Acids Lip Balm 15ml #1 - ORD60-1",
    totalPrice: "980.00",
    currency: "LKR",
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    createdAt: "2026-03-10T14:00:00.000Z",
  },
];

function formatDateTime(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-LK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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

function buildInitialForm(contact: ContactItem | null): DetailForm {
  return {
    remarks:
      contact?.id === MOCK_CONTACT.id
        ? "Loyal customer interested in skincare follow-ups and WhatsApp reminders."
        : "-",
    serviceProvider: contact?.id === MOCK_CONTACT.id ? "Dialog" : "N/A",
    district: contact?.id === MOCK_CONTACT.id ? "Gampaha" : "N/A",
    town: contact?.id === MOCK_CONTACT.id ? "Ragama" : "N/A",
    origin: contact?.id === MOCK_CONTACT.id ? "Website" : "N/A",
    customerType: contact?.status === "active" ? "Loyalty Customer" : "N/A",
    gender: contact?.id === MOCK_CONTACT.id ? "Female" : "N/A",
    name: contact?.name ?? "",
    workPlace: contact?.id === MOCK_CONTACT.id ? "Head Office - Pepiliyana" : "-",
    occupation: contact?.id === MOCK_CONTACT.id ? "Executive" : "-",
    address:
      contact?.id === MOCK_CONTACT.id
        ? "No.314/4, Batuwatta, Ragama"
        : "-",
    birthYear: contact?.id === MOCK_CONTACT.id ? "1994" : "0",
    birthMonth: contact?.id === MOCK_CONTACT.id ? "08" : "0",
    birthDay: contact?.id === MOCK_CONTACT.id ? "17" : "0",
    email: contact?.email ?? "",
    category: contact?.status === "active" ? "Interested" : "N/A",
    contactSaved: contact?.id === MOCK_CONTACT.id ? "YES" : "NO",
    whatsappAllowed: contact?.phoneNumber ? "YES" : "NO",
    mainProfileNo: contact?.phoneNumber ?? "",
    remindDate: contact?.id === MOCK_CONTACT.id ? "2026-04-05" : "",
    remindTime: "03:30 PM",
  };
}

export function ContactAllocationPanel({
  initialData,
  canManage,
}: {
  initialData: ContactAllocationPanelInitialData;
  canManage: boolean;
}) {
  const contactsForDisplay =
    initialData.contacts.length > 0 ? initialData.contacts : [MOCK_CONTACT];

  const [phoneSearch, setPhoneSearch] = useState(contactsForDisplay[0]?.phoneNumber ?? "");
  const [selectedContactId, setSelectedContactId] = useState(contactsForDisplay[0]?.id ?? "");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<ContactPurchaseOrder[]>([]);
  const [form, setForm] = useState<DetailForm>(() =>
    buildInitialForm(contactsForDisplay[0] ?? null)
  );

  const selectedContact = useMemo(() => {
    if (selectedContactId) {
      return contactsForDisplay.find((contact) => contact.id === selectedContactId) ?? null;
    }
    return null;
  }, [contactsForDisplay, selectedContactId]);

  useEffect(() => {
    setForm(buildInitialForm(selectedContact));
  }, [selectedContact]);

  useEffect(() => {
    if (!selectedContact) {
      setOrders([]);
      return;
    }

    if (selectedContact.id === MOCK_CONTACT.id) {
      setOrders(MOCK_ORDERS);
      setOrdersLoading(false);
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

  useEffect(() => {
    if (!selectedContact) return;

    console.log("Contact allocation preview", {
      selectedContact,
      form,
      orders,
    });
  }, [selectedContact, form, orders]);

  const totalPurchased = orders.reduce((sum, order) => {
    const amount = Number.parseFloat(order.totalPrice);
    return Number.isNaN(amount) ? sum : sum + amount;
  }, 0);

  function handlePhoneSearch() {
    const normalizedQuery = phoneSearch.trim();
    if (!normalizedQuery) {
      notify.error("Enter a phone number to search");
      return;
    }

    const exactMatch = contactsForDisplay.find(
      (contact) => (contact.phoneNumber ?? "").trim() === normalizedQuery
    );

    if (!exactMatch) {
      notify.error("No customer found for that phone number");
      return;
    }

    setSelectedContactId(exactMatch.id);
    notify.success(`Loaded ${exactMatch.name}`);
  }

  function handleUpdate() {
    if (!selectedContact) return;
    notify.success(`Contact allocation updated for ${selectedContact.name}`);
  }

  function updateForm<K extends keyof DetailForm>(key: K, value: DetailForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Contact Allocation</CardTitle>
          <CardDescription>
            Search by phone number, review purchase history, and update contact details.
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
              >
                Check
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_300px]">
              <div className="space-y-2">
                <div className="space-y-1 text-sm">
                  <p className="text-sm font-medium text-muted-foreground">Merchant</p>
                  <Input value={selectedContact?.recentMerchant ?? "N/A"} readOnly />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Total Purchased (Web) (LKR)
                </p>
                <Input value={formatAmount(String(totalPurchased), "LKR")} readOnly />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Role (Website) (linked with Email)
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

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Profile Picture</p>
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
                        <th className="px-4 py-3 text-left font-semibold">Store</th>
                        <th className="px-4 py-3 text-left font-semibold">Code</th>
                        <th className="px-4 py-3 text-left font-semibold">Item</th>
                        <th className="px-4 py-3 text-left font-semibold">Days</th>
                        <th className="px-4 py-3 text-left font-semibold">L.P. Date</th>
                        <th className="px-4 py-3 text-left font-semibold">Finish In</th>
                        <th className="px-4 py-3 text-left font-semibold">Methode of Use</th>
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
                          <td className="px-4 py-3">{formatDateTime(order.createdAt)}</td>
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
                Update CRM notes, customer profile details, and follow-up scheduling in one place.
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
                  Add important context, reminders, and team notes for this contact.
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
                      Identity and personal fields used by the team during customer follow-up.
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
                    <label className="text-sm font-medium">Main Profile No</label>
                    <Input
                      value={form.mainProfileNo}
                      onChange={(event) => updateForm("mainProfileNo", event.target.value)}
                      disabled={!canManage}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-12">
                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Work Place</label>
                    <Input
                      value={form.workPlace}
                      onChange={(event) => updateForm("workPlace", event.target.value)}
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Occupation</label>
                    <Input
                      value={form.occupation}
                      onChange={(event) => updateForm("occupation", event.target.value)}
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Date of Birth (YYYY / MM / DD)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        value={form.birthYear}
                        onChange={(event) => updateForm("birthYear", event.target.value)}
                        disabled={!canManage}
                      />
                      <Input
                        value={form.birthMonth}
                        onChange={(event) => updateForm("birthMonth", event.target.value)}
                        disabled={!canManage}
                      />
                      <Input
                        value={form.birthDay}
                        onChange={(event) => updateForm("birthDay", event.target.value)}
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
                    CRM grouping and audience fields used for categorization and targeting.
                  </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-12">
                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Service Provider</label>
                    <Select
                      value={form.serviceProvider}
                      onValueChange={(value) => updateForm("serviceProvider", value)}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        <SelectItem value="Dialog">Dialog</SelectItem>
                        <SelectItem value="Mobitel">Mobitel</SelectItem>
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
                        <SelectItem value="Colombo">Colombo</SelectItem>
                        <SelectItem value="Gampaha">Gampaha</SelectItem>
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
                        <SelectItem value="Ragama">Ragama</SelectItem>
                        <SelectItem value="Colombo">Colombo</SelectItem>
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
                        <SelectItem value="Website">Website</SelectItem>
                        <SelectItem value="Store">Store</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 xl:col-span-4">
                    <label className="text-sm font-medium">Customer Type</label>
                    <Select
                      value={form.customerType}
                      onValueChange={(value) => updateForm("customerType", value)}
                      disabled={!canManage}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N/A">N/A</SelectItem>
                        <SelectItem value="Loyalty Customer">Loyalty Customer</SelectItem>
                        <SelectItem value="New Customer">New Customer</SelectItem>
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
                        <SelectItem value="Interested">Interested</SelectItem>
                        <SelectItem value="Follow Up">Follow Up</SelectItem>
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
                      onValueChange={(value) => updateForm("contactSaved", value)}
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
                    <label className="text-sm font-medium">Allowed for WhatsApp Msg</label>
                    <Select
                      value={form.whatsappAllowed}
                      onValueChange={(value) => updateForm("whatsappAllowed", value)}
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
                    <label className="text-sm font-medium">Main Profile No</label>
                    <Input
                      value={form.mainProfileNo}
                      onChange={(event) => updateForm("mainProfileNo", event.target.value)}
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
                    <label className="text-sm font-medium text-cyan-700">Remind Date</label>
                    <Input
                      type="date"
                      value={form.remindDate}
                      onChange={(event) => updateForm("remindDate", event.target.value)}
                      disabled={!canManage}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Remind Time</label>
                    <div className="flex">
                      <Input
                        value={form.remindTime}
                        onChange={(event) => updateForm("remindTime", event.target.value)}
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
                disabled={!selectedContact || !canManage}
                className="h-11 w-full bg-green-600 hover:bg-green-700"
              >
                Update Contact
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
