"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Loader2,
  Mail,
  Save,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsedDate.getTime())) return "";
  return parsedDate.toISOString().slice(0, 10);
}

function formatDateDisplay(date: string | Date | null | undefined): string {
  if (date == null) return "-";
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsedDate.getTime())) return "-";
  return parsedDate.toLocaleDateString();
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
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="rounded-xl border bg-background/80 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="size-4 text-sky-700" aria-hidden />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Profile Photo
          </h3>
        </div>
        <ProfilePhotoUpload
          value={profilePhotoUrl}
          onChange={setProfilePhotoUrl}
          disabled={isBusy}
        />
      </section>

      <section className="rounded-xl border bg-background/80 p-4 sm:p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
            <UserRound className="size-4" aria-hidden />
          </div>
          <div>
            <h3 className="text-base font-semibold">Personal Information</h3>
            <p className="text-sm text-muted-foreground">
              Update the personal details attached to your account.
            </p>
          </div>
        </div>

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
            <NativeSelect
              id="profile-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={isBusy}
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
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
      </section>

      <section className="rounded-xl border bg-muted/20 p-4 sm:p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <BriefcaseBusiness className="size-4" aria-hidden />
          </div>
          <div>
            <h3 className="text-base font-semibold">Work & Account Details</h3>
            <p className="text-sm text-muted-foreground">
              These details are managed by your organization and cannot be edited here.
            </p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
            <dd className="mt-1 flex items-center gap-2 text-sm">
              <Mail className="size-3.5 text-muted-foreground" aria-hidden />
              <span>{initialData.email ?? "-"}</span>
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Roles</dt>
            <dd className="mt-1 text-sm">
              {initialData.roles.length > 0
                ? initialData.roles.map((role) => role.name).join(", ")
                : "-"}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Employee number
            </dt>
            <dd className="mt-1 text-sm">
              {initialData.employeeProfile?.employeeNumber ?? "-"}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">EPF number</dt>
            <dd className="mt-1 text-sm">
              {initialData.employeeProfile?.epfNumber ?? "-"}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Location</dt>
            <dd className="mt-1 text-sm">
              {initialData.employeeProfile?.location?.name ?? "-"}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Department</dt>
            <dd className="mt-1 text-sm">
              {initialData.employeeProfile?.department?.name ?? "-"}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Designation</dt>
            <dd className="mt-1 text-sm">
              {initialData.employeeProfile?.designation?.name ?? "-"}
            </dd>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Appointment date
            </dt>
            <dd className="mt-1 text-sm">
              {formatDateDisplay(initialData.employeeProfile?.appointmentDate)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isBusy || !hasChanges} className="min-w-36">
          {busyKey === "save" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" aria-hidden />
              Save changes
            </>
          )}
        </Button>
        <p className="text-sm text-muted-foreground">
          {hasChanges ? "You have unsaved profile changes." : "Your profile is up to date."}
        </p>
      </div>
    </form>
  );
}
