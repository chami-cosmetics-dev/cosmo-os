"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { formatAppIsoDate } from "@/lib/format-datetime";

type ConfigResponse = {
  enabled: boolean;
  recipients: string[];
  lastSentReportDate: string | null;
  lastSendStatus: string | null;
  lastSendAt: string | null;
};

type PreviewResponse = {
  reportDate: string;
  orderCount: number;
  totalsByCurrency: Array<{
    currency: string;
    count: number;
    sumIncl: number;
    sumShipping: number;
    sumExcl: number;
  }>;
  orders: Array<{
    orderName: string;
    amountIncl: number;
    shipping: number;
    amountExcl: number;
    currency: string;
    reason: string;
  }>;
  subject?: string | null;
  sendTest?: {
    ok: boolean;
    skipped?: boolean;
    status?: string;
    errorSummary?: string;
    recipientCount?: number;
  };
  error?: string;
};

interface ErpSyncFailureEmailSettingsFormProps {
  canEdit: boolean;
}

export function ErpSyncFailureEmailSettingsForm({ canEdit }: ErpSyncFailureEmailSettingsFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [recipientsText, setRecipientsText] = useState("");
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatAppIsoDate(d);
  });
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [lastSend, setLastSend] = useState<string | null>(null);

  const isBusy = saving || previewBusy || testBusy;

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/company/erp-sync-failure-email", { cache: "no-store" });
      const data = (await res.json()) as ConfigResponse & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load ERP sync failure email settings");
        return;
      }
      setEnabled(data.enabled);
      setRecipientsText((data.recipients ?? []).join("\n"));
      if (data.lastSentReportDate) {
        setLastSend(
          `${data.lastSentReportDate} · ${data.lastSendStatus ?? "—"}${
            data.lastSendAt
              ? ` · ${new Date(data.lastSendAt).toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}`
              : ""
          }`,
        );
      }
    } catch {
      notify.error("Failed to load ERP sync failure email settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    try {
      const recipients = recipientsText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/company/erp-sync-failure-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, recipients }),
      });
      const data = (await res.json()) as ConfigResponse & { error?: string };
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to save settings");
        return;
      }
      setEnabled(data.enabled);
      setRecipientsText((data.recipients ?? []).join("\n"));
      notify.success("ERP sync failure email settings saved.");
      await loadConfig();
    } catch {
      notify.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview(sendTest: boolean) {
    if (sendTest && !canEdit) return;
    if (sendTest) setTestBusy(true);
    else setPreviewBusy(true);
    try {
      const res = await fetch("/api/admin/company/erp-sync-failure-email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate, sendTest }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok) {
        notify.error(data.error ?? "Preview failed");
        return;
      }
      const totals = (data.totalsByCurrency ?? [])
        .map(
          (t) =>
            `${t.currency}: ${t.count} orders · incl ${t.sumIncl.toLocaleString("en-LK")} · ship ${t.sumShipping.toLocaleString("en-LK")} · excl ${t.sumExcl.toLocaleString("en-LK")}`,
        )
        .join("\n");
      setPreviewSummary(
        `Report ${data.reportDate} · ${data.orderCount} order(s)\n${totals || "No currency totals"}\n${
          data.subject ? `Subject: ${data.subject}` : ""
        }`,
      );
      if (sendTest) {
        if (data.sendTest?.ok) {
          notify.success(
            `Test email sent (${data.sendTest.recipientCount ?? 0} recipient${
              (data.sendTest.recipientCount ?? 0) !== 1 ? "s" : ""
            })`,
          );
          await loadConfig();
        } else if (data.sendTest?.skipped) {
          notify.error(`Test skipped: ${data.sendTest.status ?? "skipped"}`);
        } else {
          notify.error(data.sendTest?.errorSummary ?? "Test email failed");
        }
      } else {
        notify.success(`Preview ready (${data.orderCount} order${data.orderCount !== 1 ? "s" : ""})`);
      }
    } catch {
      notify.error(sendTest ? "Test email failed" : "Preview failed");
    } finally {
      if (sendTest) setTestBusy(false);
      else setPreviewBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading ERP sync failure email…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ERP sync failure email</CardTitle>
        <CardDescription>
          End-of-day alert for orders that still failed ERP sync (Asia/Colombo cutoff). Includes
          amounts with and without shipping so heads can tally daily sales. Add leadership emails
          one per line. For Supplement Vault, start with{" "}
          <span className="font-mono">buddhima.cosmetics@outlook.com</span>. Empty list or disabled
          skips live sends; preview still works.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit || isBusy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled (cron will send when recipients are set)
        </label>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="erp-sync-failure-recipients">
            Recipient email addresses
          </label>
          <Textarea
            id="erp-sync-failure-recipients"
            value={recipientsText}
            disabled={!canEdit || isBusy}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder={"buddhima.cosmetics@outlook.com\nops@example.com"}
            rows={4}
            className="font-mono text-sm"
          />
        </div>

        {lastSend && (
          <p className="text-xs text-muted-foreground">Last send log: {lastSend}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canEdit || isBusy} onClick={() => void handleSave()}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="erp-sync-failure-report-date">
            Report date
          </label>
          <Input
            id="erp-sync-failure-report-date"
            type="date"
            value={reportDate}
            disabled={isBusy}
            onChange={(e) => setReportDate(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => void handlePreview(false)}
            >
              {previewBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Previewing...
                </>
              ) : (
                "Preview"
              )}
            </Button>
            <Button
              disabled={!canEdit || isBusy}
              className="bg-teal-700 text-white hover:bg-teal-800"
              onClick={() => void handlePreview(true)}
            >
              {testBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Sending...
                </>
              ) : (
                "Send test email"
              )}
            </Button>
          </div>
          {previewSummary && (
            <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
              {previewSummary}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
