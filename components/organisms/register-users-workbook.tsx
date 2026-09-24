"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { isCompletePhoneSearch } from "@/lib/phone-lookup";
import type { RegisterCaptureRow } from "@/lib/register-users/types";

const HEADER_PREFIX = "register-users-header:";

type HeaderState = {
  location: string;
  badgeStart: string;
  badgeEnd: string;
};

type PageData = {
  today: string;
  rows: RegisterCaptureRow[];
  historyDays: { date: string; count: number }[];
};

function headerKey(today: string) {
  return `${HEADER_PREFIX}${today}`;
}

function readHeader(today: string): HeaderState {
  if (typeof window === "undefined") {
    return { location: "", badgeStart: "", badgeEnd: "" };
  }
  try {
    const raw = sessionStorage.getItem(headerKey(today));
    if (!raw) return { location: "", badgeStart: "", badgeEnd: "" };
    const parsed = JSON.parse(raw) as Partial<HeaderState>;
    return {
      location: typeof parsed.location === "string" ? parsed.location : "",
      badgeStart: typeof parsed.badgeStart === "string" ? parsed.badgeStart : "",
      badgeEnd: typeof parsed.badgeEnd === "string" ? parsed.badgeEnd : "",
    };
  } catch {
    return { location: "", badgeStart: "", badgeEnd: "" };
  }
}

function outcomeLabel(outcome: string) {
  if (outcome === "already_registered") return "already registered";
  if (outcome === "updated") return "updated";
  return "created";
}

export function RegisterUsersWorkbook() {
  const today = useMemo(() => formatAppIsoDate(new Date()), []);
  const [header, setHeader] = useState<HeaderState>({
    location: "",
    badgeStart: "",
    badgeEnd: "",
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [historyDay, setHistoryDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [headerHydrated, setHeaderHydrated] = useState(false);

  const headerReady =
    header.location.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(header.badgeStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(header.badgeEnd) &&
    header.badgeEnd >= header.badgeStart;

  useEffect(() => {
    setHeader(readHeader(today));
    setHeaderHydrated(true);
  }, [today]);

  useEffect(() => {
    if (typeof window === "undefined" || !headerHydrated) return;
    if (!header.location && !header.badgeStart && !header.badgeEnd) {
      sessionStorage.removeItem(headerKey(today));
      return;
    }
    sessionStorage.setItem(headerKey(today), JSON.stringify(header));
  }, [header, headerHydrated, today]);

  const loadPageData = useCallback(async (day = today) => {
    const res = await fetch(
      `/api/admin/register-users/page-data?day=${encodeURIComponent(day)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify.error(typeof data.error === "string" ? data.error : "Load failed.");
      return;
    }
    setPageData({
      today: typeof data.today === "string" ? data.today : today,
      rows: Array.isArray(data.rows) ? data.rows : [],
      historyDays: Array.isArray(data.historyDays) ? data.historyDays : [],
    });
  }, [today]);

  useEffect(() => {
    void loadPageData(historyDay);
  }, [historyDay, loadPageData]);

  async function lookupPhone(value: string) {
    if (!isCompletePhoneSearch(value)) {
      setLookupNote(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/register-users/lookup?phone=${encodeURIComponent(value)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setLookupNote("Several contacts share this phone. Pick one in Contact Master.");
        return;
      }
      if (!res.ok) return;
      if (!data.match) {
        setLookupNote(null);
        return;
      }
      setName(data.match.name ?? "");
      setEmail(data.match.email ?? "");
      setBirthYear(data.match.birthYear != null ? String(data.match.birthYear) : "");
      setBirthMonth(data.match.birthMonth != null ? String(data.match.birthMonth) : "");
      setBirthDay(data.match.birthDay != null ? String(data.match.birthDay) : "");
      setLookupNote("Already registered. Details loaded. Save applies a new badge.");
      notify.info("Already registered. Existing name, email, and birthday loaded.");
    } catch {
      // optional
    }
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!headerReady) {
      notify.error("Set location and date range first.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name,
        phoneNumber: phone,
        email: email.trim() || undefined,
        location: header.location.trim(),
        badgeStart: header.badgeStart,
        badgeEnd: header.badgeEnd,
      };
      if (birthYear && birthMonth && birthDay) {
        body.birthYear = Number(birthYear);
        body.birthMonth = Number(birthMonth);
        body.birthDay = Number(birthDay);
      }
      const res = await fetch("/api/admin/register-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Save failed.");
        return;
      }
      notify.success(`Saved: ${outcomeLabel(data.outcome)}`);
      setName("");
      setPhone("");
      setEmail("");
      setBirthYear("");
      setBirthMonth("");
      setBirthDay("");
      setLookupNote(null);
      setHistoryDay(today);
      await loadPageData(today);
    } catch {
      notify.error("Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createQr() {
    if (!headerReady) {
      notify.error("Set location and date range first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/register-users/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: header.location.trim(),
          badgeStart: header.badgeStart,
          badgeEnd: header.badgeEnd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "QR failed.");
        return;
      }
      setQrUrl(typeof data.url === "string" ? data.url : null);
      setQrDataUrl(typeof data.qrDataUrl === "string" ? data.qrDataUrl : null);
      notify.success("QR created. Stamp is fixed to this header.");
    } catch {
      notify.error("QR failed.");
    } finally {
      setBusy(false);
    }
  }

  const rows = pageData?.rows ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Header (today only)</CardTitle>
          <CardDescription>
            Location + one date range. Next save uses this stamp. Tomorrow this
            header is empty.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Location</span>
            <Input
              value={header.location}
              onChange={(e) =>
                setHeader((h) => ({ ...h, location: e.target.value }))
              }
              placeholder="Kandy"
              disabled={busy}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Badge start</span>
            <Input
              type="date"
              value={header.badgeStart}
              min={today}
              onChange={(e) =>
                setHeader((h) => ({ ...h, badgeStart: e.target.value }))
              }
              disabled={busy}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Badge end</span>
            <Input
              type="date"
              value={header.badgeEnd}
              min={header.badgeStart || today}
              onChange={(e) =>
                setHeader((h) => ({ ...h, badgeEnd: e.target.value }))
              }
              disabled={busy}
            />
          </label>
          <div className="sm:col-span-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !headerReady}
              onClick={() => void createQr()}
            >
              Create QR
            </Button>
          </div>
          {qrUrl ? (
            <div className="space-y-2 sm:col-span-4">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Registration QR" className="h-40 w-40" />
              ) : null}
              <p className="break-all text-sm text-muted-foreground">{qrUrl}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add user</CardTitle>
          <CardDescription>
            New phone creates an unallocated Contact Master. Existing phone
            updates the same row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSave(e)}>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Phone</span>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => void lookupPhone(phone)}
                required
                disabled={busy || !headerReady}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={busy || !headerReady}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy || !headerReady}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Year</span>
                <Input
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  disabled={busy || !headerReady}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Month</span>
                <Input
                  inputMode="numeric"
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  disabled={busy || !headerReady}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Day</span>
                <Input
                  inputMode="numeric"
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  disabled={busy || !headerReady}
                />
              </label>
            </div>
            {lookupNote ? (
              <p className="text-sm text-amber-700 dark:text-amber-400 sm:col-span-2">
                {lookupNote}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy || !headerReady}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today / history</CardTitle>
          <CardDescription>
            All saves for the selected Colombo day, including already registered
            and updated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block max-w-xs space-y-1 text-sm">
            <span className="text-muted-foreground">Day</span>
            <Input
              type="date"
              value={historyDay}
              max={today}
              onChange={(e) => setHistoryDay(e.target.value || today)}
              disabled={busy}
            />
          </label>
          {pageData?.historyDays?.length ? (
            <p className="text-xs text-muted-foreground">
              History:{" "}
              {pageData.historyDays
                .map((d) => `${d.date} (${d.count})`)
                .join(" · ")}
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No registrations this day. Set header and add a user.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Badge</th>
                    <th className="py-2 pr-3">Outcome</th>
                    <th className="py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">{row.name}</td>
                      <td className="py-2 pr-3">{row.phone ?? "—"}</td>
                      <td className="py-2 pr-3">{row.email ?? "—"}</td>
                      <td className="py-2 pr-3">{row.location}</td>
                      <td className="py-2 pr-3">
                        {row.badgeStart}–{row.badgeEnd}
                      </td>
                      <td className="py-2 pr-3">{outcomeLabel(row.outcome)}</td>
                      <td className="py-2">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
