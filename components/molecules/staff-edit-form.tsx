"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  nicNo: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  mobile: string | null;
  knownName: string | null;
  employeeProfile: {
    employeeNumber: string | null;
    epfNumber: string | null;
    locationId: string | null;
    departmentId: string | null;
    designationId: string | null;
    appointmentDate: string | null;
    status: string;
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
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

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
        <label htmlFor="staff-gender" className="text-sm font-medium">
          Gender
        </label>
        <select
          id="staff-gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          disabled={!canEdit || isBusy}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          {GENDER_OPTIONS.map((opt) => (
            <option key={opt.value || "empty"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
        <label htmlFor="staff-location" className="text-sm font-medium">
          Company location
        </label>
        <select
          id="staff-location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          disabled={!canEdit || isBusy}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">Select location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="staff-department" className="text-sm font-medium">
          Department
        </label>
        <select
          id="staff-department"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          disabled={!canEdit || isBusy}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="staff-designation" className="text-sm font-medium">
          Designation
        </label>
        <select
          id="staff-designation"
          value={designationId}
          onChange={(e) => setDesignationId(e.target.value)}
          disabled={!canEdit || isBusy}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">Select designation</option>
          {designations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
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
