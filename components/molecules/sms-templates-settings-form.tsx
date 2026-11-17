"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import {
  buildLoyaltyWishPlaceholderVars,
  renderSmsTemplatePlaceholders,
} from "@/lib/sms-templates/render";
import type { SmsTemplatePurpose } from "@/lib/sms-templates/catalog";

export type SmsTemplateDto = {
  id: string | null;
  key: string;
  name: string;
  purpose: SmsTemplatePurpose;
  body: string;
  active: boolean;
  placeholders: string[];
  builtin: boolean;
  saved: boolean;
};

type SmsTemplatesResponse = {
  templates: SmsTemplateDto[];
  officeContactPhone: string;
};

interface SmsTemplatesSettingsFormProps {
  canEdit: boolean;
  initialData?: SmsTemplatesResponse | null;
}

const EMPTY_DRAFT: SmsTemplateDto = {
  id: null,
  key: "",
  name: "",
  purpose: "custom",
  body: "",
  active: true,
  placeholders: [
    "customerName",
    "tier",
    "discountPercent",
    "merchantName",
    "merchantPhone",
    "officePhone",
  ],
  builtin: false,
  saved: false,
};

const SAMPLE_PREVIEW_VARS = buildLoyaltyWishPlaceholderVars({
  customerName: "Ayesha",
  tier: "Gold",
  discountPercent: 10,
  merchantName: "Maheshi",
  merchantPhone: "0771234567",
  officePhone: "0112345678",
});

export function SmsTemplatesSettingsForm({
  canEdit,
  initialData,
}: SmsTemplatesSettingsFormProps) {
  const [loading, setLoading] = useState(initialData === undefined);
  const [noCompany, setNoCompany] = useState(initialData === null);
  const [forbidden, setForbidden] = useState(false);
  const [templates, setTemplates] = useState<SmsTemplateDto[]>(
    initialData?.templates ?? [],
  );
  const [officePhone, setOfficePhone] = useState(
    initialData?.officeContactPhone ?? "",
  );
  const [savedOfficePhone, setSavedOfficePhone] = useState(
    initialData?.officeContactPhone ?? "",
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialData?.templates?.[0]?.key ?? null,
  );
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<SmsTemplateDto>(
    initialData?.templates?.[0] ?? EMPTY_DRAFT,
  );
  const [lastSaved, setLastSaved] = useState<SmsTemplateDto>(
    initialData?.templates?.[0] ?? EMPTY_DRAFT,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;
  const hasTemplateChanges = useMemo(() => {
    return (
      draft.name.trim() !== lastSaved.name.trim() ||
      draft.key.trim() !== lastSaved.key.trim() ||
      draft.purpose !== lastSaved.purpose ||
      draft.body.trim() !== lastSaved.body.trim() ||
      draft.active !== lastSaved.active
    );
  }, [draft, lastSaved]);
  const hasOfficeChanges = officePhone.trim() !== savedOfficePhone.trim();

  const previewBody = useMemo(() => {
    const vars = {
      ...SAMPLE_PREVIEW_VARS,
      officePhone: officePhone.trim() || SAMPLE_PREVIEW_VARS.officePhone,
      tier: draft.purpose === "platinum_wish" ? "Platinum" : "Gold",
      discountPercent: draft.purpose === "platinum_wish" ? "15" : "10",
    };
    return renderSmsTemplatePlaceholders(draft.body || "", vars);
  }, [draft.body, draft.purpose, officePhone]);

  function selectTemplate(t: SmsTemplateDto) {
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
    const res = await fetch("/api/admin/company/sms-templates");
    if (!res.ok) throw new Error("Failed to reload templates");
    const data = (await res.json()) as SmsTemplatesResponse;
    setTemplates(data.templates);
    setOfficePhone(data.officeContactPhone ?? "");
    setSavedOfficePhone(data.officeContactPhone ?? "");
    const next =
      data.templates.find((t) => t.key === preferKey) ??
      data.templates[0] ??
      null;
    if (next) selectTemplate(next);
    else startCreate();
  }

  useEffect(() => {
    if (initialData !== undefined && initialData !== null) {
      setForbidden(false);
      setLoading(false);
      if (initialData.templates[0]) selectTemplate(initialData.templates[0]);
      return;
    }
    async function fetchTemplates() {
      try {
        if (!canEdit) {
          setForbidden(true);
          setLoading(false);
          return;
        }
        const res = await fetch("/api/admin/company/sms-templates");
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
          notify.error(data.error ?? "Failed to load SMS templates");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as SmsTemplatesResponse;
        setTemplates(data.templates);
        setOfficePhone(data.officeContactPhone ?? "");
        setSavedOfficePhone(data.officeContactPhone ?? "");
        if (data.templates[0]) selectTemplate(data.templates[0]);
      } catch {
        notify.error("Failed to load SMS templates");
      } finally {
        setLoading(false);
      }
    }
    void fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, initialData]);

  async function handleSaveTemplate() {
    setBusyKey("save-template");
    try {
      const res = await fetch("/api/admin/company/sms-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: draft.key.trim(),
          name: draft.name.trim(),
          purpose: draft.purpose,
          body: draft.body,
          active: draft.active,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (SmsTemplatesResponse & { error?: string; template?: SmsTemplateDto })
        | null;
      if (!res.ok) {
        notify.error(data?.error ?? "Failed to save template");
        return;
      }
      notify.success("SMS template saved");
      if (data?.templates) setTemplates(data.templates);
      await refreshList(draft.key.trim());
    } catch {
      notify.error("Failed to save template");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSaveOffice() {
    setBusyKey("save-office");
    try {
      const res = await fetch("/api/admin/company/loyalty-sms-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeContactPhone: officePhone }),
      });
      const data = (await res.json().catch(() => null)) as {
        officeContactPhone?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        notify.error(data?.error ?? "Failed to save office phone");
        return;
      }
      const next = data?.officeContactPhone ?? officePhone.trim();
      setOfficePhone(next);
      setSavedOfficePhone(next);
      notify.success("Office contact number saved");
    } catch {
      notify.error("Failed to save office phone");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete() {
    if (draft.builtin) return;
    setBusyKey("delete-template");
    try {
      const res = await fetch("/api/admin/company/sms-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: draft.key.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        notify.error(data?.error ?? "Failed to delete template");
        return;
      }
      notify.success("Template deleted");
      await refreshList();
    } catch {
      notify.error("Failed to delete template");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading SMS templates…
      </div>
    );
  }

  if (forbidden || !canEdit) {
    return (
      <p className="text-muted-foreground text-sm">
        You do not have permission to manage SMS templates.
      </p>
    );
  }

  if (noCompany) {
    return (
      <p className="text-muted-foreground text-sm">
        No company associated with your account.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Office contact number</CardTitle>
          <CardDescription>
            Fills {"{{officePhone}}"} in loyalty wish SMS for next-order help.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="office-phone">
              Office phone
            </label>
            <Input
              id="office-phone"
              value={officePhone}
              disabled={isBusy}
              onChange={(e) => setOfficePhone(e.target.value)}
              placeholder="0112345678"
            />
          </div>
          <Button
            type="button"
            disabled={isBusy || !hasOfficeChanges}
            onClick={() => void handleSaveOffice()}
          >
            {busyKey === "save-office" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save office phone"
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Templates</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={startCreate}
            >
              <Plus className="size-4" aria-hidden />
              New
            </Button>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-1 overflow-y-auto p-2">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={isBusy}
                onClick={() => selectTemplate(t)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  !creating && selectedKey === t.key
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted/60 text-muted-foreground"
                }`}
              >
                <div className="font-medium text-foreground">{t.name}</div>
                <div className="text-muted-foreground truncate font-mono text-xs">
                  {t.key}
                  {!t.active ? " · inactive" : ""}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4" aria-hidden />
              {creating ? "New template" : "Edit template"}
            </CardTitle>
            <CardDescription>
              Placeholders:{" "}
              {draft.placeholders.map((p) => `{{${p}}}`).join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="sms-name">
                Name
              </label>
              <Input
                id="sms-name"
                value={draft.name}
                disabled={isBusy}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="sms-key">
                Key
              </label>
              <Input
                id="sms-key"
                value={draft.key}
                disabled={isBusy || draft.builtin || (!creating && draft.saved)}
                onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
                placeholder="loyalty_gold_wish_3"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="sms-purpose">
                Purpose
              </label>
              <select
                id="sms-purpose"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={draft.purpose}
                disabled={isBusy || draft.builtin}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    purpose: e.target.value as SmsTemplatePurpose,
                  }))
                }
              >
                <option value="gold_wish">Gold wish</option>
                <option value="platinum_wish">Platinum wish</option>
                <option value="custom">Custom (no auto-send)</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor="sms-active">
                Active (in random pool)
              </label>
              <Switch
                id="sms-active"
                checked={draft.active}
                disabled={isBusy}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({ ...d, active: checked }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="sms-body">
                Body
              </label>
              <Textarea
                id="sms-body"
                value={draft.body}
                disabled={isBusy}
                rows={8}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              />
              <p className="text-muted-foreground text-xs">
                {draft.body.length} / 1600 characters
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={isBusy || !hasTemplateChanges || !draft.key.trim() || !draft.body.trim()}
                onClick={() => void handleSaveTemplate()}
              >
                {busyKey === "save-template" ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Saving...
                  </>
                ) : (
                  "Save template"
                )}
              </Button>
              {!draft.builtin && draft.saved && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isBusy}
                  onClick={() => void handleDelete()}
                >
                  {busyKey === "delete-template" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="size-4" aria-hidden />
              Preview
            </CardTitle>
            <CardDescription>Sample values — not a live send.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="bg-muted/40 whitespace-pre-wrap rounded-md border p-3 text-sm leading-relaxed">
              {previewBody || "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
