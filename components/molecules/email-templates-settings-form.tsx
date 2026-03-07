"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

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
        <CardTitle>Email Templates</CardTitle>
        <p className="text-muted-foreground text-sm">
          Configure notification emails sent when staff events occur. Use placeholders in subject and body.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3">Resignation Notice</h3>
            <p className="text-muted-foreground text-xs mb-3">
              Sent to management when a staff member&apos;s resignation and offboarding are completed.
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
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

          {canEdit && (
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
          )}
        </form>
      </CardContent>
    </Card>
  );
}
