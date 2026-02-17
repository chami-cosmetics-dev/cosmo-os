"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfilePhotoUpload } from "@/components/molecules/profile-photo-upload";
import { notify } from "@/lib/notify";

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

type ProfileData = {
  id: string;
  name: string | null;
  email: string | null;
  picture: string | null;
  profilePhotoUrl: string | null;
  nicNo: string | null;
  gender: string | null;
  dateOfBirth: string | Date | null;
  mobile: string | null;
  knownName: string | null;
  roles: Array<{ id: string; name: string }>;
  employeeProfile: {
    employeeNumber: string | null;
    epfNumber: string | null;
    location: { id: string; name: string } | null;
    department: { id: string; name: string } | null;
    designation: { id: string; name: string } | null;
    appointmentDate: string | Date | null;
  } | null;
};

interface ProfileFormProps {
  initialData: ProfileData | null;
}

function formatDateForInput(date: string | Date | null | undefined): string {
  if (date == null) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(date: string | Date | null | undefined): string {
  if (date == null) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [knownName, setKnownName] = useState("");
  const [nicNo, setNicNo] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [mobile, setMobile] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;

  const hasChanges =
    initialData &&
    (name.trim() !== (initialData.name ?? "").trim() ||
      knownName.trim() !== (initialData.knownName ?? "").trim() ||
      nicNo.trim() !== (initialData.nicNo ?? "").trim() ||
      gender !== (initialData.gender ?? "") ||
      dateOfBirth !== formatDateForInput(initialData.dateOfBirth) ||
      mobile.trim() !== (initialData.mobile ?? "").trim());

  useEffect(() => {
    if (initialData) {
      setName(initialData.name ?? "");
      setKnownName(initialData.knownName ?? "");
      setNicNo(initialData.nicNo ?? "");
      setGender(initialData.gender ?? "");
      setDateOfBirth(formatDateForInput(initialData.dateOfBirth));
      setMobile(initialData.mobile ?? "");
      setProfilePhotoUrl(initialData.profilePhotoUrl ?? null);
    }
  }, [initialData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setBusyKey("save");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          knownName: knownName.trim() || undefined,
          nicNo: nicNo.trim() || undefined,
          gender: gender || undefined,
          dateOfBirth: dateOfBirth || undefined,
          mobile: mobile.trim() || undefined,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update profile");
        return;
      }

      notify.success("Profile updated.");
      router.refresh();
    } catch {
      notify.error("Failed to update profile");
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="space-y-4">
        <ProfilePhotoUpload
          value={profilePhotoUrl}
          onChange={setProfilePhotoUrl}
          disabled={isBusy}
        />
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Personal information</h3>
        <p className="text-muted-foreground text-sm">
          You can edit the details you provided when activating your account.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              Full name
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isBusy}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="profile-knownName" className="text-sm font-medium">
              Known name
            </label>
            <Input
              id="profile-knownName"
              value={knownName}
              onChange={(e) => setKnownName(e.target.value)}
              disabled={isBusy}
              placeholder="Short name"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="profile-nicNo" className="text-sm font-medium">
              NIC No
            </label>
            <Input
              id="profile-nicNo"
              value={nicNo}
              onChange={(e) => setNicNo(e.target.value)}
              disabled={isBusy}
              placeholder="National Identity Card Number"
              maxLength={15}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="profile-gender" className="text-sm font-medium">
              Gender
            </label>
            <select
              id="profile-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={isBusy}
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
            <label htmlFor="profile-dateOfBirth" className="text-sm font-medium">
              Date of birth
            </label>
            <Input
              id="profile-dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={isBusy}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="profile-mobile" className="text-sm font-medium">
              Mobile
            </label>
            <Input
              id="profile-mobile"
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={isBusy}
              maxLength={100}
            />
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-sm font-medium">Account & employment details</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          These details are managed by your organization and cannot be edited here.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Email</dt>
            <dd className="mt-0.5 text-sm">{initialData.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Roles</dt>
            <dd className="mt-0.5 text-sm">
              {initialData.roles.length > 0
                ? initialData.roles.map((r) => r.name).join(", ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Employee number</dt>
            <dd className="mt-0.5 text-sm">
              {initialData.employeeProfile?.employeeNumber ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">EPF number</dt>
            <dd className="mt-0.5 text-sm">
              {initialData.employeeProfile?.epfNumber ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Location</dt>
            <dd className="mt-0.5 text-sm">
              {initialData.employeeProfile?.location?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Department</dt>
            <dd className="mt-0.5 text-sm">
              {initialData.employeeProfile?.department?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Designation</dt>
            <dd className="mt-0.5 text-sm">
              {initialData.employeeProfile?.designation?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Appointment date</dt>
            <dd className="mt-0.5 text-sm">
              {formatDateDisplay(initialData.employeeProfile?.appointmentDate)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isBusy || !hasChanges}>
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
    </form>
  );
}
