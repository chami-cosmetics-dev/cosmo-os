"use client";

import { useEffect, useMemo, useState } from "react";

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

type Status = "loading" | "ready" | "missing" | "saved" | "error";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function birthYears(): number[] {
  const newest = new Date().getFullYear() - 10;
  const years: number[] = [];
  for (let year = newest; year >= 1940; year -= 1) years.push(year);
  return years;
}

function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function portalEmailError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Email is required";
  if (!EMAIL_RE.test(trimmed)) return "Enter a valid email (e.g. name@gmail.com)";
  return null;
}

function portalPhoneError(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "Phone is required";
  if (digits.length !== 10) return "Phone must be 10 digits";
  return null;
}

export function RegisterPortalForm({ token }: { token: string }) {
  const years = useMemo(() => birthYears(), []);
  const [status, setStatus] = useState<Status>("loading");
  const [locationLabel, setLocationLabel] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    phone?: string;
    birthday?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  const dayCount = daysInMonth(Number(birthYear), Number(birthMonth));

  useEffect(() => {
    if (!birthDay) return;
    if (Number(birthDay) > dayCount) setBirthDay("");
  }, [birthDay, dayCount]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/register/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("missing");
          setMessage(
            typeof data.error === "string" ? data.error : "Link not found.",
          );
          return;
        }
        setLocationLabel(
          typeof data.locationLabel === "string" ? data.locationLabel : "",
        );
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("missing");
          setMessage("Unable to load this registration link.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function validate(): boolean {
    const next = {
      email: portalEmailError(email) ?? undefined,
      phone: portalPhoneError(phoneNumber) ?? undefined,
      birthday:
        !birthYear || !birthMonth || !birthDay
          ? "Select year, month, and date"
          : undefined,
    };
    setFieldErrors(next);
    return !next.email && !next.phone && !next.birthday;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) {
      setStatus("error");
      setMessage("");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/register/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phoneNumber: phoneNumber.replace(/\D/g, ""),
          birthYear: Number(birthYear),
          birthMonth: Number(birthMonth),
          birthDay: Number(birthDay),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        const details = data.details?.fieldErrors as
          | Record<string, string[] | undefined>
          | undefined;
        setFieldErrors({
          email: details?.email?.[0],
          phone: details?.phoneNumber?.[0],
          birthday:
            details?.birthYear?.[0] ??
            details?.birthMonth?.[0] ??
            details?.birthDay?.[0],
        });
        setMessage(
          typeof data.error === "string" && data.error !== "Validation failed"
            ? data.error
            : "Check the highlighted fields.",
        );
        return;
      }
      setStatus("saved");
      setMessage("Saved. Thank you.");
    } catch {
      setStatus("error");
      setMessage("Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-start px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>
            {locationLabel
              ? `Location: ${locationLabel}`
              : "Enter your details."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : status === "missing" ? (
            <p className="text-sm text-destructive">{message}</p>
          ) : status === "saved" ? (
            <p className="text-sm text-foreground">{message}</p>
          ) : (
            <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Email</span>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  onBlur={() =>
                    setFieldErrors((prev) => ({
                      ...prev,
                      email: portalEmailError(email) ?? undefined,
                    }))
                  }
                  placeholder="name@gmail.com"
                  required
                  disabled={busy}
                />
                {fieldErrors.email ? (
                  <span className="text-xs text-destructive">{fieldErrors.email}</span>
                ) : null}
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Phone</span>
                <Input
                  inputMode="numeric"
                  value={phoneNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhoneNumber(digits);
                    setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  onBlur={() =>
                    setFieldErrors((prev) => ({
                      ...prev,
                      phone: portalPhoneError(phoneNumber) ?? undefined,
                    }))
                  }
                  placeholder="0771234567"
                  required
                  disabled={busy}
                />
                {fieldErrors.phone ? (
                  <span className="text-xs text-destructive">{fieldErrors.phone}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">10 digits</span>
                )}
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm text-muted-foreground">Birthday</legend>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={birthYear}
                    onValueChange={(value) => {
                      setBirthYear(value);
                      setFieldErrors((prev) => ({ ...prev, birthday: undefined }));
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger aria-label="Birth year">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={birthMonth}
                    onValueChange={(value) => {
                      setBirthMonth(value);
                      setFieldErrors((prev) => ({ ...prev, birthday: undefined }));
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger aria-label="Birth month">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={birthDay}
                    onValueChange={(value) => {
                      setBirthDay(value);
                      setFieldErrors((prev) => ({ ...prev, birthday: undefined }));
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger aria-label="Birth date">
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={String(day)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {fieldErrors.birthday ? (
                  <span className="text-xs text-destructive">{fieldErrors.birthday}</span>
                ) : null}
              </fieldset>
              {message ? (
                <p className="text-sm text-destructive">{message}</p>
              ) : null}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Saving…" : "Save"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
