"use client";

import { useState, useEffect } from "react";
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
      <Card>
        <CardHeader>
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
      <Card>
        <CardHeader>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" aria-hidden />
          Email Templates
        </CardTitle>
        <CardDescription>
          Edit the template HTML and see live output side by side.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-4 rounded-xl border bg-muted/15 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                Template Editor
              </h4>
              <div className="space-y-2">
                <label htmlFor="resign-subject" className="text-sm font-medium">Subject</label>
                <Input
                  id="resign-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="Staff Resignation: {{staffName}}"
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
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="resign-body" className="text-sm font-medium">Body (HTML)</label>
                <Textarea
                  id="resign-body"
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  disabled={!canEdit || isBusy}
                  placeholder="Email body with placeholders..."
                  rows={14}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/15 p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Eye className="size-4 text-muted-foreground" aria-hidden />
                Live Preview
              </h4>
              <div className="space-y-2 rounded-lg border bg-background p-3">
                <p className="text-xs font-semibold">Subject</p>
                <p className="text-sm">{subject.trim() || "No subject provided."}</p>
              </div>
              <div className="mt-3 space-y-2 rounded-lg border bg-background p-3">
                <p className="text-xs font-semibold">Recipients</p>
                <p className="text-sm break-all">{recipients.trim() || "No recipients provided."}</p>
              </div>
              <div className="mt-3 space-y-2 rounded-lg border bg-background p-3">
                <p className="text-xs font-semibold">Body</p>
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_*]:break-words">
                  <div dangerouslySetInnerHTML={{ __html: bodyHtml || "<p>No body content provided.</p>" }} />
                </div>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                {hasChanges ? "You have unsaved template changes." : "All template changes are saved."}
              </p>
              <Button type="submit" disabled={isBusy || !hasChanges} className="sm:min-w-36">
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
