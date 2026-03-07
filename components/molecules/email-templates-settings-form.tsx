"use client";

import { useState, useEffect } from "react";
import { CircleCheck, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { LIMITS } from "@/lib/validation";

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

const PLACEHOLDER_HINT = "Placeholders: {{staffName}}, {{resignationDate}}, {{reason}}, {{employeeNumber}}, {{department}}, {{designation}}, {{location}}";
const PLACEHOLDERS = [
  "{{staffName}}",
  "{{resignationDate}}",
  "{{reason}}",
  "{{employeeNumber}}",
  "{{department}}",
  "{{designation}}",
  "{{location}}",
];

export function EmailTemplatesSettingsForm({ canEdit, initialTemplates }: EmailTemplatesSettingsFormProps) {
  const [loading, setLoading] = useState(initialTemplates === undefined);
  const [noCompany, setNoCompany] = useState(initialTemplates === null);
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
      setLoading(false);
      const t = initialTemplates.resignation_notice;
      if (t) {
        setLastSaved({ subject: t.subject, bodyHtml: t.bodyHtml, recipients: t.recipients });
      }
      return;
    }
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/admin/company/email-templates");
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
  }, [initialTemplates]);

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

  if (loading) {
    return (
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading email template settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (noCompany) {
    return (
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No company is associated with your account. Email templates are configured per company.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
          <FileText className="size-3.5" aria-hidden />
          Notification Content
        </div>
        <div>
          <CardTitle>Email Templates</CardTitle>
          <p className="text-muted-foreground text-sm">
            Customize template subject, body, and recipients for internal notification emails.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Template Type
            </p>
            <p className="mt-2 text-sm font-semibold">Resignation Notice</p>
            <p className="mt-1 text-xs text-muted-foreground">HR and leadership notification flow.</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Save Status
            </p>
            <p className="mt-2 text-sm font-semibold">
              {hasChanges ? "Unsaved changes detected" : "Template is up to date"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasChanges ? "Review and save before leaving this page." : "No pending edits in this template."}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Available Placeholders
            </p>
            <p className="mt-2 text-sm font-semibold">{PLACEHOLDERS.length} tokens</p>
            <p className="mt-1 text-xs text-muted-foreground">Use tokens in subject and HTML body.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Resignation Notice
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Sent to management once a staff resignation and offboarding process are completed.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="resign-subject" className="text-sm font-medium">
                  Subject
                </label>
                <Input
                  id="resign-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="Staff Resignation: {{staffName}}"
                  maxLength={LIMITS.emailTemplateSubject.max}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="resign-body" className="text-sm font-medium">
                  Body (HTML)
                </label>
                <textarea
                  id="resign-body"
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="Email body with placeholders..."
                  maxLength={LIMITS.emailTemplateBody.max}
                  rows={12}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                />
                <p className="text-muted-foreground text-xs">{PLACEHOLDER_HINT}</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="resign-recipients" className="text-sm font-medium">
                  Recipients (comma-separated emails)
                </label>
                <Input
                  id="resign-recipients"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="hr@company.com, management@company.com"
                  maxLength={LIMITS.emailTemplateRecipients.max}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Quick Tokens
            </h4>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map((placeholder) => (
                <span
                  key={placeholder}
                  className="inline-flex items-center rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-mono"
                >
                  {placeholder}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Paste these tokens in subject or body to insert real values when email is sent.
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isBusy || !hasChanges} className="min-w-36">
                {busyKey === "save" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving...
                  </>
                ) : (
                  <>
                    <CircleCheck className="size-4" aria-hidden />
                    Save changes
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {hasChanges ? "You have unsaved changes." : "No unsaved changes."}
              </p>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
