"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
const NONE_VALUE = "__none__";

type Location = { id: string; name: string; address: string | null };
type Department = { id: string; name: string };
type Designation = { id: string; name: string };

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
  financeLocationIds?: string[];
  employeeProfile: {
    employeeNumber: string | null;
    epfNumber: string | null;
    locationId: string | null;
    location?: { id: string; name: string } | null;
    departmentId: string | null;
    department?: { id: string; name: string } | null;
    designationId: string | null;
    designation?: { id: string; name: string } | null;
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

function withSelectedOption<T extends { id: string }>(
  options: T[],
  selected: T | null | undefined
) {
  if (!selected || options.some((option) => option.id === selected.id)) {
    return options;
  }
  return [selected, ...options];
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
  const [financeLocationIds, setFinanceLocationIds] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;
  const effectiveGender = gender || (initialData?.gender ?? "").toLowerCase();
  const effectiveLocationId =
    locationId ||
    initialData?.employeeProfile?.locationId ||
    initialData?.employeeProfile?.location?.id ||
    "";
  const effectiveDepartmentId =
    departmentId ||
    initialData?.employeeProfile?.departmentId ||
    initialData?.employeeProfile?.department?.id ||
    "";
  const effectiveDesignationId =
    designationId ||
    initialData?.employeeProfile?.designationId ||
    initialData?.employeeProfile?.designation?.id ||
    "";
  const genderLabel =
    GENDER_OPTIONS.find((option) => option.value === effectiveGender)?.label ?? "Select gender";
  const locationOptions = withSelectedOption(
    locations,
    initialData?.employeeProfile?.location
      ? {
          ...initialData.employeeProfile.location,
          address: null,
        }
      : null
  );
  const departmentOptions = withSelectedOption(
    departments,
    initialData?.employeeProfile?.department ?? null
  );
  const designationOptions = withSelectedOption(
    designations,
    initialData?.employeeProfile?.designation ?? null
  );
  const locationLabel =
    locationOptions.find((loc) => loc.id === effectiveLocationId)?.name ?? "Select location";
  const departmentLabel =
    departmentOptions.find((department) => department.id === effectiveDepartmentId)?.name ??
    "Select department";
  const designationLabel =
    designationOptions.find((designation) => designation.id === effectiveDesignationId)?.name ??
    "Select designation";

  useEffect(() => {
    if (initialData) {
      setName(initialData.name ?? "");
      setKnownName(initialData.knownName ?? "");
      setNicNo(initialData.nicNo ?? "");
      setGender((initialData.gender ?? "").toLowerCase());
      setDateOfBirth(formatDateForInput(initialData.dateOfBirth));
      setMobile(initialData.mobile ?? "");
      setEmployeeNumber(initialData.employeeProfile?.employeeNumber ?? "");
      setEpfNumber(initialData.employeeProfile?.epfNumber ?? "");
      setLocationId(
        initialData.employeeProfile?.locationId ??
          initialData.employeeProfile?.location?.id ??
          ""
      );
      setDepartmentId(
        initialData.employeeProfile?.departmentId ??
          initialData.employeeProfile?.department?.id ??
          ""
      );
      setDesignationId(
        initialData.employeeProfile?.designationId ??
          initialData.employeeProfile?.designation?.id ??
          ""
      );
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
      setFinanceLocationIds(initialData.financeLocationIds ?? []);
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
          financeLocationIds,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <label htmlFor="staff-email" className="text-sm font-medium">
          Email
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
        <label htmlFor="staff-nicNo" className="text-sm font-medium">
          NIC No
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
        <label className="text-sm font-medium">
          Gender
        </label>
        <Select
          value={effectiveGender || NONE_VALUE}
          onValueChange={(value) => setGender(value === NONE_VALUE ? "" : value)}
          disabled={!canEdit || isBusy}
        >
          <SelectTrigger id="staff-gender">
            <SelectValue placeholder="Select gender">{genderLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GENDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "empty"} value={opt.value || NONE_VALUE}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <div className="border-t pt-4">
        <p className="text-muted-foreground mb-3 text-sm font-medium">
          Employment details
        </p>
      </div>
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
        <label className="text-sm font-medium">
          Company location
        </label>
        <Select
          value={effectiveLocationId || NONE_VALUE}
          onValueChange={(value) =>
            setLocationId(value === NONE_VALUE ? "" : value)
          }
          disabled={!canEdit || isBusy}
        >
          <SelectTrigger id="staff-location">
            <SelectValue placeholder="Select location">{locationLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Select location</SelectItem>
            {locationOptions.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Department
        </label>
        <Select
          value={effectiveDepartmentId || NONE_VALUE}
          onValueChange={(value) =>
            setDepartmentId(value === NONE_VALUE ? "" : value)
          }
          disabled={!canEdit || isBusy}
        >
          <SelectTrigger id="staff-department">
            <SelectValue placeholder="Select department">{departmentLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Select department</SelectItem>
            {departmentOptions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Designation
        </label>
        <Select
          value={effectiveDesignationId || NONE_VALUE}
          onValueChange={(value) =>
            setDesignationId(value === NONE_VALUE ? "" : value)
          }
          disabled={!canEdit || isBusy}
        >
          <SelectTrigger id="staff-designation">
            <SelectValue placeholder="Select designation">{designationLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Select designation</SelectItem>
            {designationOptions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <div className="border-t pt-4">
        <p className="text-muted-foreground mb-3 text-sm font-medium">
          Merchant (order assignment)
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="staff-shopifyUserIds" className="text-sm font-medium">
          Shopify User IDs
        </label>
        <Input
          id="staff-shopifyUserIds"
          value={shopifyUserIds}
          onChange={(e) => setShopifyUserIds(e.target.value)}
          disabled={!canEdit || isBusy}
          placeholder="e.g. 115650822432, 115650822433"
        />
        <p className="text-muted-foreground text-xs">
          Comma-separated. POS orders from these staff members will be assigned to this user.
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
          Comma-separated. Web orders with these Shopify discount or MER codes will be assigned to this user.
        </p>
      </div>

      <div className="border-t pt-4">
        <p className="text-muted-foreground mb-3 text-sm font-medium">
          Order fulfillment
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="staff-isRider"
          type="checkbox"
          checked={isRider}
          onChange={(e) => setIsRider(e.target.checked)}
          disabled={!canEdit || isBusy}
          className="size-4 rounded border-input"
        />
        <label htmlFor="staff-isRider" className="text-sm font-medium">
          Is Rider
        </label>
      </div>
      <p className="text-muted-foreground text-xs">
        Riders can be assigned to dispatch orders and receive delivery confirmation via SMS.
      </p>

      {locations.length > 0 && (
        <>
          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-1 text-sm font-medium">
              Finance notification scope
            </p>
            <p className="text-muted-foreground mb-3 text-xs">
              Which company locations this user receives finance approval notifications for. Leave all unchecked to receive notifications for all locations.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {locations.map((loc) => (
              <label key={loc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={financeLocationIds.includes(loc.id)}
                  onChange={(e) =>
                    setFinanceLocationIds(
                      e.target.checked
                        ? [...financeLocationIds, loc.id]
                        : financeLocationIds.filter((id) => id !== loc.id)
                    )
                  }
                  disabled={!canEdit || isBusy}
                  className="size-4 rounded border-input"
                />
                {loc.name}
              </label>
            ))}
          </div>
        </>
      )}

      {canEdit && (
        <div className="flex gap-2">
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
          <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}
