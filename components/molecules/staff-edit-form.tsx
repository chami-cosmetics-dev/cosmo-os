"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

type Location = { id: string; name: string; address: string | null };
type Department = { id: string; name: string };
type Designation = { id: string; name: string };
type SelectOption = { value: string; label: string };

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  nicNo: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  mobile: string | null;
  knownName: string | null;
  shopifyUserIds?: string[];
  couponCodes?: string[];
  employeeProfile: {
    employeeNumber: string | null;
    epfNumber: string | null;
    locationId: string | null;
    departmentId: string | null;
    designationId: string | null;
    appointmentDate: string | null;
    status: string;
    isRider: boolean;
  } | null;
};

interface StaffEditFormProps {
  staffId: string;
  initialData: StaffMember | null;
  locations: Location[];
  departments: Department[];
  designations: Designation[];
  canEdit: boolean;
  onSaved: () => void;
  onClose: () => void;
}

function formatDateForInput(date: string | Date | null | undefined): string {
  if (date == null) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function StaffEditForm({
  staffId,
  initialData,
  locations,
  departments,
  designations,
  canEdit,
  onSaved,
  onClose,
}: StaffEditFormProps) {
  const [name, setName] = useState("");
  const [knownName, setKnownName] = useState("");
  const [nicNo, setNicNo] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [mobile, setMobile] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [epfNumber, setEpfNumber] = useState("");
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [shopifyUserIds, setShopifyUserIds] = useState("");
  const [couponCodes, setCouponCodes] = useState("");
  const [isRider, setIsRider] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;
  const genderOptions: SelectOption[] = GENDER_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));
  const locationOptions: SelectOption[] = [
    { value: "", label: "Select location" },
    ...locations.map((loc) => ({ value: loc.id, label: loc.name })),
  ];
  const departmentOptions: SelectOption[] = [
    { value: "", label: "Select department" },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ];
  const designationOptions: SelectOption[] = [
    { value: "", label: "Select designation" },
    ...designations.map((d) => ({ value: d.id, label: d.name })),
  ];

  useEffect(() => {
    if (initialData) {
      setName(initialData.name ?? "");
      setKnownName(initialData.knownName ?? "");
      setNicNo(initialData.nicNo ?? "");
      setGender(initialData.gender ?? "");
      setDateOfBirth(formatDateForInput(initialData.dateOfBirth));
      setMobile(initialData.mobile ?? "");
      setEmployeeNumber(initialData.employeeProfile?.employeeNumber ?? "");
      setEpfNumber(initialData.employeeProfile?.epfNumber ?? "");
      setLocationId(initialData.employeeProfile?.locationId ?? "");
      setDepartmentId(initialData.employeeProfile?.departmentId ?? "");
      setDesignationId(initialData.employeeProfile?.designationId ?? "");
      setAppointmentDate(
        formatDateForInput(initialData.employeeProfile?.appointmentDate)
      );
      setShopifyUserIds(
        (initialData as StaffMember).shopifyUserIds?.join(", ") ?? ""
      );
      setCouponCodes(
        (initialData as StaffMember).couponCodes?.join(", ") ?? ""
      );
      setIsRider(initialData.employeeProfile?.isRider ?? false);
    }
  }, [initialData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    setBusyKey("save");
    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          knownName: knownName.trim() || undefined,
          nicNo: nicNo.trim() || undefined,
          gender: gender || undefined,
          dateOfBirth: dateOfBirth || undefined,
          mobile: mobile.trim() || undefined,
          employeeNumber: employeeNumber.trim() || undefined,
          epfNumber: epfNumber.trim() || undefined,
          locationId: locationId || null,
          departmentId: departmentId || null,
          designationId: designationId || null,
          appointmentDate: appointmentDate || undefined,
          shopifyUserIds: shopifyUserIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          couponCodes: couponCodes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          isRider,
        }),
      });

      const data = (await res.json()) as StaffMember & { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update staff");
        return;
      }

      notify.success("Staff details updated.");
      onSaved();
      onClose();
    } catch {
      notify.error("Failed to update staff");
    } finally {
      setBusyKey(null);
    }
  }

  if (!initialData) {
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-2">
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-semibold">Edit Staff Member</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Update personal details, employment assignment, and fulfillment settings.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border bg-card/70 p-4">
        <div>
          <h3 className="text-sm font-semibold">Personal Information</h3>
          <p className="text-muted-foreground text-xs">
            Core identity and contact details used across the dashboard.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="staff-email" className="text-sm font-medium">
              Email (read only)
            </label>
            <Input
              id="staff-email"
              value={initialData.email ?? ""}
              readOnly
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-name" className="text-sm font-medium">
              Full name
            </label>
            <Input
              id="staff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit || isBusy}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-knownName" className="text-sm font-medium">
              Known name
            </label>
            <Input
              id="staff-knownName"
              value={knownName}
              onChange={(e) => setKnownName(e.target.value)}
              disabled={!canEdit || isBusy}
              placeholder="Short name"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-mobile" className="text-sm font-medium">
              Mobile
            </label>
            <Input
              id="staff-mobile"
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={!canEdit || isBusy}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-nicNo" className="text-sm font-medium">
              NIC Number
            </label>
            <Input
              id="staff-nicNo"
              value={nicNo}
              onChange={(e) => setNicNo(e.target.value)}
              disabled={!canEdit || isBusy}
              maxLength={15}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-gender" className="text-sm font-medium">
              Gender
            </label>
            <FormMenuSelect
              id="staff-gender"
              value={gender}
              onChange={setGender}
              options={genderOptions}
              disabled={!canEdit || isBusy}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-dateOfBirth" className="text-sm font-medium">
              Date of birth
            </label>
            <Input
              id="staff-dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={!canEdit || isBusy}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card/70 p-4">
        <div>
          <h3 className="text-sm font-semibold">Employment Details</h3>
          <p className="text-muted-foreground text-xs">
            Role alignment and internal identifiers used for HR and reporting.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="staff-employeeNumber" className="text-sm font-medium">
              Employee number
            </label>
            <Input
              id="staff-employeeNumber"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              disabled={!canEdit || isBusy}
              maxLength={50}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-epfNumber" className="text-sm font-medium">
              EPF number
            </label>
            <Input
              id="staff-epfNumber"
              value={epfNumber}
              onChange={(e) => setEpfNumber(e.target.value)}
              disabled={!canEdit || isBusy}
              maxLength={50}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-location" className="text-sm font-medium">
              Company location
            </label>
            <FormMenuSelect
              id="staff-location"
              value={locationId}
              onChange={setLocationId}
              options={locationOptions}
              disabled={!canEdit || isBusy}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-department" className="text-sm font-medium">
              Department
            </label>
            <FormMenuSelect
              id="staff-department"
              value={departmentId}
              onChange={setDepartmentId}
              options={departmentOptions}
              disabled={!canEdit || isBusy}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-designation" className="text-sm font-medium">
              Designation
            </label>
            <FormMenuSelect
              id="staff-designation"
              value={designationId}
              onChange={setDesignationId}
              options={designationOptions}
              disabled={!canEdit || isBusy}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="staff-appointmentDate" className="text-sm font-medium">
              Appointment date
            </label>
            <Input
              id="staff-appointmentDate"
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              disabled={!canEdit || isBusy}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card/70 p-4">
        <div>
          <h3 className="text-sm font-semibold">Merchant Assignment Rules</h3>
          <p className="text-muted-foreground text-xs">
            Define auto-assignment rules for POS and web orders.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="staff-shopifyUserIds" className="text-sm font-medium">
            Shopify user IDs
          </label>
          <Input
            id="staff-shopifyUserIds"
            value={shopifyUserIds}
            onChange={(e) => setShopifyUserIds(e.target.value)}
            disabled={!canEdit || isBusy}
            placeholder="e.g. 115650822432, 115650822433"
          />
          <p className="text-muted-foreground text-xs">
            Comma-separated IDs. POS orders from these users will be assigned to this staff member.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="staff-couponCodes" className="text-sm font-medium">
            Coupon codes
          </label>
          <Input
            id="staff-couponCodes"
            value={couponCodes}
            onChange={(e) => setCouponCodes(e.target.value)}
            disabled={!canEdit || isBusy}
            placeholder="e.g. MERCHANT10, SAVE20"
          />
          <p className="text-muted-foreground text-xs">
            Comma-separated codes. Web orders with these codes will be assigned here.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card/70 p-4">
        <h3 className="text-sm font-semibold">Fulfillment Access</h3>
        <label
          htmlFor="staff-isRider"
          className="flex items-start gap-2 rounded-md border border-border/60 p-3"
        >
          <input
            id="staff-isRider"
            type="checkbox"
            checked={isRider}
            onChange={(e) => setIsRider(e.target.checked)}
            disabled={!canEdit || isBusy}
            className="mt-0.5 size-4 rounded border-input"
          />
          <span>
            <span className="block text-sm font-medium">Mark as rider</span>
            <span className="text-muted-foreground block text-xs">
              Riders can be assigned to dispatch orders and receive delivery confirmation via SMS.
            </span>
          </span>
        </label>
      </section>

      {canEdit && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
          <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button type="submit" disabled={isBusy}>
            {busyKey === "save" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      )}
    </form>
  );
}

interface FormMenuSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}

function FormMenuSelect({
  id,
  value,
  onChange,
  options,
  disabled,
}: FormMenuSelectProps) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "Select";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className="border-input bg-background hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {selectedLabel}
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value || "empty"}
            onSelect={() => onChange(option.value)}
            className="justify-between"
          >
            <span>{option.label}</span>
            {value === option.value ? <Check className="size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
