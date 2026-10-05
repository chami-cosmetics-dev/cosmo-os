"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { isCompletePhoneSearch } from "@/lib/phone-lookup";
import {
  REGISTER_EMAIL_PHOTO_MAX_BYTES,
  registerEmailPhotoMime,
  safeRegisterEmailPhotoName,
} from "@/lib/register-users/email-photo";
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

type EmailTemplateState = {
  header: string;
  body: string;
  photoUrl: string | null;
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

function downloadQrPng(dataUrl: string, location: string) {
  const slug = location
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = slug ? `register-qr-${slug}.png` : "register-qr.png";
  a.click();
}

function outcomeLabel(outcome: string) {
  if (outcome === "already_registered") return "already registered";
  if (outcome === "updated") return "updated";
  return "created";
}

function mailStatusLabel(row: RegisterCaptureRow) {
  if (row.mailStatus === "sent") return "Sent";
  if (row.mailStatus === "failed") return "Failed";
  if (row.mailStatus === "skipped") {
    if (row.mailError === "no_email") return "No email";
    if (row.mailError === "no_template") return "Template empty";
    return "Not sent";
  }
  return "Not sent";
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
  const [emailTpl, setEmailTpl] = useState<EmailTemplateState>({
    header: "",
    body: "",
    photoUrl: null,
  });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [resendId, setResendId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const headerReady =
    header.location.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(header.badgeStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(header.badgeEnd) &&
    header.badgeEnd >= header.badgeStart;

  const loadPageData = useCallback(async (day = today, applySettings = false) => {
    const res = await fetch(
      `/api/admin/register-users/page-data?day=${encodeURIComponent(day)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify.error(typeof data.error === "string" ? data.error : "Load failed.");
      if (applySettings) {
        setHeader(readHeader(today));
        setHeaderHydrated(true);
      }
      return;
    }
    setPageData({
      today: typeof data.today === "string" ? data.today : today,
      rows: Array.isArray(data.rows) ? data.rows : [],
      historyDays: Array.isArray(data.historyDays) ? data.historyDays : [],
    });
    if (!applySettings) return;
    const savedHeader = data.header as HeaderState | null;
    if (savedHeader?.location && savedHeader.badgeStart && savedHeader.badgeEnd) {
      setHeader({
        location: savedHeader.location,
        badgeStart: savedHeader.badgeStart,
        badgeEnd: savedHeader.badgeEnd,
      });
    } else {
      setHeader(readHeader(today));
    }
    if (data.qr?.url && data.qr?.qrDataUrl) {
      setQrUrl(String(data.qr.url));
      setQrDataUrl(String(data.qr.qrDataUrl));
    }
    if (data.emailTemplate && typeof data.emailTemplate === "object") {
      const tpl = data.emailTemplate as Partial<EmailTemplateState>;
      setEmailTpl({
        header: typeof tpl.header === "string" ? tpl.header : "",
        body: typeof tpl.body === "string" ? tpl.body : "",
        photoUrl: typeof tpl.photoUrl === "string" ? tpl.photoUrl : null,
      });
    }
    setHeaderHydrated(true);
  }, [today]);

  useEffect(() => {
    void loadPageData(historyDay, historyDay === today);
  }, [historyDay, loadPageData, today]);

  useEffect(() => {
    if (typeof window === "undefined" || !headerHydrated) return;
    if (!header.location && !header.badgeStart && !header.badgeEnd) {
      sessionStorage.removeItem(headerKey(today));
      return;
    }
    sessionStorage.setItem(headerKey(today), JSON.stringify(header));
  }, [header, headerHydrated, today]);

  useEffect(() => {
    if (!headerHydrated || !headerReady) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/admin/register-users/header", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: header.location.trim(),
          badgeStart: header.badgeStart,
          badgeEnd: header.badgeEnd,
        }),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [header, headerHydrated, headerReady]);

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
      if (data.email?.status === "sent") {
        notify.success("Welcome email sent.");
      } else if (data.email?.status === "skipped" && data.email.reason === "no_email") {
        notify.info("Saved. No email on this contact — mail skipped.");
      } else if (data.email?.status === "skipped") {
        notify.info("Saved. Email template empty — mail skipped.");
      } else if (data.email?.status === "failed") {
        notify.error(
          typeof data.email.error === "string"
            ? data.email.error
            : "Welcome email failed.",
        );
      }
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

  async function saveEmailTemplate() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/register-users/email-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header: emailTpl.header,
          body: emailTpl.body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Email save failed.");
        return;
      }
      if (data.emailTemplate) {
        setEmailTpl({
          header: data.emailTemplate.header ?? "",
          body: data.emailTemplate.body ?? "",
          photoUrl: data.emailTemplate.photoUrl ?? null,
        });
      }
      notify.success("Email template saved. New registrations get this mail.");
    } catch {
      notify.error("Email save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadEmailPhoto(file: File) {
    const mime = registerEmailPhotoMime(file);
    if (!mime) {
      notify.error("Use a JPG, PNG, WEBP, or GIF photo");
      return;
    }
    if (file.size > REGISTER_EMAIL_PHOTO_MAX_BYTES) {
      notify.error("Photo too large (max 5MB)");
      return;
    }
    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.set(
        "file",
        new File([file], safeRegisterEmailPhotoName(file.name), { type: mime }),
      );
      const res = await fetch("/api/admin/register-users/email-photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(
          typeof data.error === "string" ? data.error : "Photo upload failed.",
        );
        return;
      }
      if (typeof data.photoUrl === "string") {
        setEmailTpl((prev) => ({ ...prev, photoUrl: data.photoUrl }));
      }
      notify.success("Photo saved.");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function resendWelcomeEmail(row: RegisterCaptureRow) {
    setResendId(row.id);
    try {
      const res = await fetch("/api/admin/register-users/resend-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureId: row.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(
          typeof data.error === "string" ? data.error : "Resend failed.",
        );
        return;
      }
      notify.success("Welcome email sent.");
      await loadPageData(historyDay);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Resend failed.");
    } finally {
      setResendId(null);
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
                <div className="flex flex-wrap items-end gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="Registration QR" className="h-40 w-40" />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => downloadQrPng(qrDataUrl, header.location)}
                  >
                    Download QR
                  </Button>
                </div>
              ) : null}
              <p className="break-all text-sm text-muted-foreground">{qrUrl}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registration email</CardTitle>
          <CardDescription>
            Saved on the server. Everyone who registers today with an email
            gets this. Edit anytime — later saves use the new header, body, and
            photo. Use {"{{name}}"} or [Name] — send fills the registrant name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Header</span>
            <Input
              value={emailTpl.header}
              onChange={(e) =>
                setEmailTpl((prev) => ({ ...prev, header: e.target.value }))
              }
              placeholder="Hi [Name]"
              disabled={busy}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Body</span>
            <Textarea
              value={emailTpl.body}
              onChange={(e) =>
                setEmailTpl((prev) => ({ ...prev, body: e.target.value }))
              }
              placeholder="Thanks for registering today."
              rows={5}
              disabled={busy}
            />
          </label>
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">Photo</span>
            {emailTpl.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={emailTpl.photoUrl}
                alt="Email photo"
                className="max-h-40 rounded-md border"
              />
            ) : null}
            <input
              ref={photoInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
              className="hidden"
              disabled={photoBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadEmailPhoto(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || photoBusy}
              onClick={() => photoInputRef.current?.click()}
            >
              {photoBusy ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                "Choose photo"
              )}
            </Button>
            <p className="text-muted-foreground text-xs">
              JPG, PNG, WEBP, or GIF. Max 5MB.
            </p>
          </div>
          <Button
            type="button"
            disabled={busy || photoBusy}
            onClick={() => void saveEmailTemplate()}
          >
            {busy ? "Saving…" : "Save email template"}
          </Button>
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
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Auto mail</th>
                    <th className="py-2">Mail</th>
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
                      <td className="py-2 pr-3">{row.source}</td>
                      <td
                        className="py-2 pr-3"
                        title={row.mailError ?? undefined}
                      >
                        {mailStatusLabel(row)}
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || resendId != null || !row.email}
                          onClick={() => void resendWelcomeEmail(row)}
                        >
                          {resendId === row.id ? (
                            <>
                              <Loader2 className="animate-spin" aria-hidden />
                              Sending…
                            </>
                          ) : row.mailStatus === "sent" ? (
                            "Resend mail"
                          ) : (
                            "Send mail"
                          )}
                        </Button>
                      </td>
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
