"use client";

import { useRef, useState, useEffect } from "react";
import { Eye, FileText, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

type ResignationTemplate = {
  id: string | null;
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  recipients: string;
};

type EmailTemplatesResponse = {
  resignation_notice: ResignationTemplate;
};

interface EmailTemplatesSettingsFormProps {
  canEdit: boolean;
  initialTemplates?: EmailTemplatesResponse | null;
}

export function EmailTemplatesSettingsForm({ canEdit, initialTemplates }: EmailTemplatesSettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(initialTemplates === undefined);
  const [noCompany, setNoCompany] = useState(initialTemplates === null);
  const [forbidden, setForbidden] = useState(false);
  const [subject, setSubject] = useState(initialTemplates?.resignation_notice?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(initialTemplates?.resignation_notice?.bodyHtml ?? "");
  const [recipients, setRecipients] = useState(initialTemplates?.resignation_notice?.recipients ?? "");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState({
    subject: initialTemplates?.resignation_notice?.subject ?? "",
    bodyHtml: initialTemplates?.resignation_notice?.bodyHtml ?? "",
    recipients: initialTemplates?.resignation_notice?.recipients ?? "",
  });

  const isBusy = busyKey !== null;
  const hasChanges =
    subject.trim() !== lastSaved.subject.trim() ||
    bodyHtml.trim() !== lastSaved.bodyHtml.trim() ||
    recipients.trim() !== lastSaved.recipients.trim();

  useEffect(() => {
    if (initialTemplates !== undefined && initialTemplates !== null) {
      setForbidden(false);
      setLoading(false);
      const t = initialTemplates.resignation_notice;
      if (t) {
        setLastSaved({ subject: t.subject, bodyHtml: t.bodyHtml, recipients: t.recipients });
      }
      return;
    }
    async function fetchTemplates() {
      try {
        if (!canEdit) {
          setForbidden(true);
          setLoading(false);
          return;
        }
        const res = await fetch("/api/admin/company/email-templates");
        if (res.status === 403) {
          setForbidden(true);
          setLoading(false);
          return;
        }
        if (res.status === 404) {
          setNoCompany(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          notify.error(data.error ?? "Failed to load email templates");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as EmailTemplatesResponse;
        const t = data.resignation_notice;
        setSubject(t.subject);
        setBodyHtml(t.bodyHtml);
        setRecipients(t.recipients);
        setLastSaved({ subject: t.subject, bodyHtml: t.bodyHtml, recipients: t.recipients });
      } catch {
        notify.error("Failed to load email templates");
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, [canEdit, initialTemplates]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || isBusy) return;

    setBusyKey("save");
    try {
      const res = await fetch("/api/admin/company/email-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "resignation_notice",
          subject: subject.trim(),
          bodyHtml: bodyHtml.trim(),
          recipients: recipients.trim(),
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Failed to update email templates");
        return;
      }

      notify.success("Email templates updated.");
      setLastSaved({ subject: subject.trim(), bodyHtml: bodyHtml.trim(), recipients: recipients.trim() });
    } catch {
      notify.error("Failed to update email templates");
    } finally {
      setBusyKey(null);
    }
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || !canEdit || isBusy) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const isTextarea = target.tagName === "TEXTAREA";
    const isModifiedEnter = e.ctrlKey || e.metaKey;

    // Inside HTML editor: allow normal Enter, but support Ctrl/Cmd+Enter to save quickly.
    if (isTextarea && !isModifiedEnter) return;

    // For input fields and Ctrl/Cmd+Enter in textarea: submit directly.
    e.preventDefault();
    formRef.current?.requestSubmit();
  }

  if (loading) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>Preparing template editor...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (noCompany) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>Company configuration required</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No company is associated with your account. Email templates are configured per company.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (forbidden) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Company settings are available to users with the appropriate
            permissions. Contact your administrator to update company
            information.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" aria-hidden />
          Email Templates
        </CardTitle>
        <CardDescription>
          Edit the template HTML and see live output side by side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
              Template
            </p>
            <p className="mt-2 text-sm font-semibold">Resignation Notice</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Staff offboarding email sent to the configured recipients.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
              Status
            </p>
            <p className="mt-2 text-sm font-semibold">
              {hasChanges ? "Draft changes pending" : "Saved and up to date"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {canEdit ? "Use Ctrl/Cmd + Enter in the editor to save quickly." : "You can preview the template but editing is disabled."}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
              Placeholders
            </p>
            <p className="mt-2 text-sm font-semibold">
              {"{{staffName}} {{resignationDate}} {{department}}"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Keep placeholder names unchanged so dynamic data renders correctly.
            </p>
          </div>
        </div>
        <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-4 rounded-2xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-5 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4 text-muted-foreground" aria-hidden />
                  Template Editor
                </h4>
                <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  HTML editor
                </span>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-medium">Resignation Notice</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Update the subject, recipient list, and HTML body used for resignation notifications.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="resign-subject" className="text-sm font-medium">Subject</label>
                <Input
                  id="resign-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="Staff Resignation: {{staffName}}"
                  className="border-border/70 bg-background/90"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="resign-recipients" className="text-sm font-medium">Recipients</label>
                <Input
                  id="resign-recipients"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="hr@company.com, management@company.com"
                  className="border-border/70 bg-background/90"
                />
                <p className="text-muted-foreground text-xs">
                  Separate multiple email addresses with commas.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="resign-body" className="text-sm font-medium">Body (HTML)</label>
                <Textarea
                  id="resign-body"
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="Email body with placeholders..."
                  rows={16}
                  className="min-h-[360px] border-border/70 bg-background/95 font-mono text-xs"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--primary)_7%,transparent))] p-5 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Eye className="size-4 text-muted-foreground" aria-hidden />
                  Live Preview
                </h4>
                <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Updates instantly
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="space-y-2 rounded-xl border border-border/70 bg-background/90 p-4 shadow-xs">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Subject</p>
                  <p className="text-sm font-medium">{subject.trim() || "No subject provided."}</p>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 bg-background/90 p-4 shadow-xs">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Recipients</p>
                  <p className="text-sm break-all">{recipients.trim() || "No recipients provided."}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/95 p-4 shadow-xs">
                  <div className="border-b border-border/60 pb-3">
                    <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                      Email Body
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Rendered HTML preview
                    </p>
                  </div>
                  <div className="prose prose-sm dark:prose-invert mt-4 max-w-none text-sm [&_*]:break-words">
                    <div dangerouslySetInnerHTML={{ __html: bodyHtml || "<p>No body content provided.</p>" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                {hasChanges ? "You have unsaved template changes." : "All template changes are saved."}
              </p>
              <Button type="submit" disabled={isBusy || !hasChanges} className="sm:min-w-36 shadow-[0_10px_24px_-18px_var(--primary)]">
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
      </CardContent>
    </Card>
  );
}
