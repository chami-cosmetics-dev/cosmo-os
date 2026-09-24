"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, Loader2, Mail, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

export type EmailTemplateDto = {
  id: string | null;
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  recipients: string;
  ccRecipients: string;
  placeholders: string[];
  builtin: boolean;
  automated: boolean;
  saved: boolean;
};

type EmailTemplatesResponse = {
  templates: EmailTemplateDto[];
};

interface EmailTemplatesSettingsFormProps {
  canEdit: boolean;
  initialTemplates?: EmailTemplatesResponse | null;
}

const EMPTY_DRAFT: EmailTemplateDto = {
  id: null,
  key: "",
  name: "",
  subject: "",
  bodyHtml: "",
  recipients: "",
  ccRecipients: "",
  placeholders: [],
  builtin: false,
  automated: false,
  saved: false,
};

export function EmailTemplatesSettingsForm({
  canEdit,
  initialTemplates,
}: EmailTemplatesSettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(initialTemplates === undefined);
  const [noCompany, setNoCompany] = useState(initialTemplates === null);
  const [forbidden, setForbidden] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplateDto[]>(
    initialTemplates?.templates ?? [],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialTemplates?.templates?.[0]?.key ?? null,
  );
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<EmailTemplateDto>(
    initialTemplates?.templates?.[0] ?? EMPTY_DRAFT,
  );
  const [lastSaved, setLastSaved] = useState<EmailTemplateDto>(
    initialTemplates?.templates?.[0] ?? EMPTY_DRAFT,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;
  const hasChanges = useMemo(() => {
    return (
      draft.name.trim() !== lastSaved.name.trim() ||
      draft.key.trim() !== lastSaved.key.trim() ||
      draft.subject.trim() !== lastSaved.subject.trim() ||
      draft.bodyHtml.trim() !== lastSaved.bodyHtml.trim() ||
      draft.recipients.trim() !== lastSaved.recipients.trim() ||
      draft.ccRecipients.trim() !== lastSaved.ccRecipients.trim()
    );
  }, [draft, lastSaved]);

  function selectTemplate(t: EmailTemplateDto) {
    setCreating(false);
    setSelectedKey(t.key);
    setDraft(t);
    setLastSaved(t);
  }

  function startCreate() {
    setCreating(true);
    setSelectedKey(null);
    const blank = { ...EMPTY_DRAFT };
    setDraft(blank);
    setLastSaved(blank);
  }

  async function refreshList(preferKey?: string) {
    const res = await fetch("/api/admin/company/email-templates");
    if (!res.ok) throw new Error("Failed to reload templates");
    const data = (await res.json()) as EmailTemplatesResponse;
    setTemplates(data.templates);
    const next =
      data.templates.find((t) => t.key === preferKey) ??
      data.templates[0] ??
      null;
    if (next) selectTemplate(next);
    else startCreate();
  }

  useEffect(() => {
    if (initialTemplates !== undefined && initialTemplates !== null) {
      setForbidden(false);
      setLoading(false);
      if (initialTemplates.templates[0]) {
        selectTemplate(initialTemplates.templates[0]);
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
        setTemplates(data.templates);
        if (data.templates[0]) selectTemplate(data.templates[0]);
      } catch {
        notify.error("Failed to load email templates");
      } finally {
        setLoading(false);
      }
    }
    void fetchTemplates();
  }, [canEdit, initialTemplates]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || isBusy) return;

    const key = draft.key.trim();
    if (!key) {
      notify.error("Template key is required");
      return;
    }

    setBusyKey("save");
    try {
      const method = creating || !draft.saved ? "POST" : "PATCH";
      // Built-ins may not be saved yet — first save uses upsert via PATCH
      const usePatch = !creating && (draft.saved || draft.builtin);
      const res = await fetch("/api/admin/company/email-templates", {
        method: usePatch ? "PATCH" : method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          name: draft.name.trim() || key,
          subject: draft.subject.trim(),
          bodyHtml: draft.bodyHtml.trim(),
          recipients: draft.recipients.trim(),
          ccRecipients: draft.ccRecipients.trim(),
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save email template");
        return;
      }

      notify.success("Email template saved.");
      await refreshList(key);
      setCreating(false);
    } catch {
      notify.error("Failed to save email template");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete() {
    if (!canEdit || isBusy || draft.builtin || !draft.saved) return;
    setBusyKey("delete");
    try {
      const res = await fetch("/api/admin/company/email-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: draft.key }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to delete template");
        return;
      }
      notify.success("Template deleted.");
      await refreshList();
    } catch {
      notify.error("Failed to delete template");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSendTest() {
    if (!canEdit || isBusy) return;
    const key = draft.key.trim();
    if (!key) {
      notify.error("Template key is required");
      return;
    }
    if (!draft.recipients.trim()) {
      notify.error("Add at least one To recipient before sending a test.");
      return;
    }

    setBusyKey("test");
    try {
      const res = await fetch("/api/admin/company/email-templates/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          name: draft.name.trim() || key,
          subject: draft.subject.trim(),
          bodyHtml: draft.bodyHtml.trim(),
          recipients: draft.recipients.trim(),
          ccRecipients: draft.ccRecipients.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to send test email");
        return;
      }
      notify.success("Test email sent.");
    } catch {
      notify.error("Failed to send test email");
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
    if (isTextarea && !isModifiedEnter) return;
    e.preventDefault();
    formRef.current?.requestSubmit();
  }

  if (loading) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
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
        <CardHeader className="border-b border-border/50">
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
        <CardHeader className="border-b border-border/50">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Company settings are available to users with the appropriate permissions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" aria-hidden />
          Email Templates
        </CardTitle>
        <CardDescription>
          Create multiple templates per company. Built-in keys power automated mails; add custom
          keys for future sends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-3 rounded-2xl border border-border/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                Templates
              </p>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={startCreate}
                >
                  <Plus className="size-3.5" aria-hidden />
                  New
                </Button>
              )}
            </div>
            <ul className="space-y-1">
              {templates.map((t) => {
                const active = !creating && selectedKey === t.key;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => selectTemplate(t)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-primary/10 font-medium text-foreground"
                          : "hover:bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      <span className="block truncate">{t.name}</span>
                      <span className="text-muted-foreground block truncate text-[11px]">
                        {t.key}
                        {t.automated ? " · daily" : ""}
                        {!t.saved && t.builtin ? " · default" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
              {creating && (
                <li>
                  <div className="bg-primary/10 rounded-xl px-3 py-2 text-sm font-medium">
                    New template
                  </div>
                </li>
              )}
            </ul>
          </div>

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
            className="space-y-4"
          >
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="space-y-4 rounded-2xl border border-border/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="size-4 text-muted-foreground" aria-hidden />
                    Template Editor
                  </h4>
                  {!draft.builtin && draft.saved && canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void handleDelete()}
                    >
                      {busyKey === "delete" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-4" aria-hidden />
                      )}
                      Delete
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="tpl-name" className="text-sm font-medium">
                      Name
                    </label>
                    <Input
                      id="tpl-name"
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      disabled={!canEdit || isBusy || draft.builtin}
                      placeholder="Stock price missing"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="tpl-key" className="text-sm font-medium">
                      Key
                    </label>
                    <Input
                      id="tpl-key"
                      value={draft.key}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                        }))
                      }
                      disabled={!canEdit || isBusy || draft.builtin || (!creating && draft.saved)}
                      placeholder="stock_price_missing_daily"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="tpl-subject" className="text-sm font-medium">
                    Subject
                  </label>
                  <Input
                    id="tpl-subject"
                    value={draft.subject}
                    onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                    disabled={!canEdit || isBusy}
                    placeholder="Report: {{reportDate}}"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="tpl-to" className="text-sm font-medium">
                    To
                  </label>
                  <Input
                    id="tpl-to"
                    value={draft.recipients}
                    onChange={(e) => setDraft((d) => ({ ...d, recipients: e.target.value }))}
                    disabled={!canEdit || isBusy}
                    placeholder="asitha@cosmetics.lk"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="tpl-cc" className="text-sm font-medium">
                    CC
                  </label>
                  <Input
                    id="tpl-cc"
                    value={draft.ccRecipients}
                    onChange={(e) => setDraft((d) => ({ ...d, ccRecipients: e.target.value }))}
                    disabled={!canEdit || isBusy}
                    placeholder="team@example.com, other@example.com"
                  />
                  <p className="text-muted-foreground text-xs">
                    Separate multiple addresses with commas.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="tpl-body" className="text-sm font-medium">
                    Body (HTML)
                  </label>
                  <Textarea
                    id="tpl-body"
                    value={draft.bodyHtml}
                    onChange={(e) => setDraft((d) => ({ ...d, bodyHtml: e.target.value }))}
                    disabled={!canEdit || isBusy}
                    rows={16}
                    className="min-h-[360px] font-mono text-xs"
                  />
                </div>

                {draft.placeholders.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Placeholders:{" "}
                    <span className="font-mono">
                      {draft.placeholders.map((p) => `{{${p}}}`).join(" ")}
                    </span>
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-border/70 p-5">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Eye className="size-4 text-muted-foreground" aria-hidden />
                  Live Preview
                </h4>
                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                    Subject
                  </p>
                  <p className="text-sm font-medium">{draft.subject.trim() || "No subject"}</p>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 p-4">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                    To / CC
                  </p>
                  <p className="text-sm break-all">
                    To: {draft.recipients.trim() || "—"}
                    <br />
                    CC: {draft.ccRecipients.trim() || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-sm [&_*]:break-words"
                    dangerouslySetInnerHTML={{
                      __html: draft.bodyHtml || "<p>No body content provided.</p>",
                    }}
                  />
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-xs">
                  {hasChanges
                    ? "Unsaved changes."
                    : draft.saved
                      ? "Saved."
                      : "Defaults shown — save to store for this company."}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy || !draft.recipients.trim()}
                    onClick={() => void handleSendTest()}
                    className="sm:min-w-36"
                  >
                    {busyKey === "test" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Sending...
                      </>
                    ) : (
                      "Send test mail"
                    )}
                  </Button>
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
              </div>
            )}
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
