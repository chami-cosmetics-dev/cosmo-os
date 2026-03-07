"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordStrengthIndicator } from "@/components/molecules/password-strength-indicator";
import { notify } from "@/lib/notify";
import { isPasswordStrong } from "@/lib/password-strength";

const EMPLOYEE_SIZE_OPTIONS = [
  { value: "", label: "Select size" },
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "500+", label: "500+" },
];

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

type Props = {
  token: string;
  email: string;
  isSuperAdmin: boolean;
};

export function InviteActivateForm({
  token,
  email,
  isSuperAdmin,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nicNo, setNicNo] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [mobile, setMobile] = useState("");
  const [knownName, setKnownName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [employeeSize, setEmployeeSize] = useState("");
  const [address, setAddress] = useState("");

  const passwordStrong = isPasswordStrong(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit =
    status !== "loading" &&
    passwordStrong &&
    passwordsMatch &&
    (!isSuperAdmin || (companyName.trim() && address.trim()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/invite/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName,
          lastName,
          password,
          confirmPassword,
          nicNo: nicNo || undefined,
          gender: gender || undefined,
          dateOfBirth: dateOfBirth || undefined,
          mobile: mobile || undefined,
          knownName: knownName || undefined,
          ...(isSuperAdmin && {
            companyName,
            employeeSize: employeeSize || undefined,
            address,
          }),
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setStatus("error");
        notify.error(data.error ?? "Activation failed");
        return;
      }

      notify.success("Account activated. Sign in to continue.");
      router.push("/auth/login?activated=1");
    } catch {
      setStatus("error");
      notify.error("Activation failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Email</label>
        <Input
          value={email}
          readOnly
          disabled
          className="bg-muted"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="firstName" className="text-sm font-medium">
          First name
        </label>
        <Input
          id="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          disabled={status === "loading"}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="lastName" className="text-sm font-medium">
          Last name
        </label>
        <Input
          id="lastName"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          disabled={status === "loading"}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="knownName" className="text-sm font-medium">
          Known name
        </label>
        <Input
          id="knownName"
          value={knownName}
          onChange={(e) => setKnownName(e.target.value)}
          disabled={status === "loading"}
          placeholder="Short name or what everyone calls you"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="nicNo" className="text-sm font-medium">
          NIC No
        </label>
        <Input
          id="nicNo"
          value={nicNo}
          onChange={(e) => setNicNo(e.target.value)}
          disabled={status === "loading"}
          placeholder="National Identity Card Number"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="gender" className="text-sm font-medium">
          Gender
        </label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          disabled={status === "loading"}
          className="border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
        >
          {GENDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="dateOfBirth" className="text-sm font-medium">
          Date of birth
        </label>
        <Input
          id="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          disabled={status === "loading"}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="mobile" className="text-sm font-medium">
          Mobile number(s)
        </label>
        <Input
          id="mobile"
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          disabled={status === "loading"}
          placeholder="e.g. 0771234567 or multiple numbers"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={status === "loading"}
          placeholder="Create a strong password"
          minLength={8}
          maxLength={128}
        />
        <PasswordStrengthIndicator password={password} />
      </div>
      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirm password
        </label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={status === "loading"}
          placeholder="Re-enter your password"
          minLength={8}
          maxLength={128}
        />
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-destructive text-xs">Passwords do not match</p>
        )}
      </div>

      {isSuperAdmin && (
        <>
          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-3 text-sm font-medium">
              Company details
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="companyName" className="text-sm font-medium">
              Company name
            </label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required={isSuperAdmin}
              disabled={status === "loading"}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="employeeSize" className="text-sm font-medium">
              Employee size
            </label>
            <select
              id="employeeSize"
              value={employeeSize}
              onChange={(e) => setEmployeeSize(e.target.value)}
              disabled={status === "loading"}
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
            >
              {EMPLOYEE_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium">
              Address
            </label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required={isSuperAdmin}
              disabled={status === "loading"}
              rows={3}
              className="border-input bg-transparent w-full rounded-md border px-3 py-2 text-sm shadow-xs"
            />
          </div>
        </>
      )}

      <Button type="submit" disabled={!canSubmit}>
        {status === "loading" ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Activating...
          </>
        ) : (
          "Activate account"
        )}
      </Button>
    </form>
  );
}
